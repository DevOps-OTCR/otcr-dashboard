/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Live Office release verification for PPTX comment posting (manual; never runs in CI).
 *
 * Proves against real Microsoft Graph that a post built from an outdated read cannot overwrite
 * newer content, then posts against the current version so the deck can be opened in PowerPoint:
 *   1. upload deck A to a NEW file in the operator's own OneDrive (never an existing file)
 *   2. read A through MicrosoftGraphService and build comments against it
 *   3. replace the remote file with B, as a concurrent editor would
 *   4. uploadPptx() with A's eTag  -> must return 412, and the remote file must still be B
 *   5. re-read B, post with B's eTag -> must succeed; the result is saved for PowerPoint
 *
 * Usage (from backend/, with delegated MSGRAPH_* credentials in .env):
 *   npx ts-node --transpile-only src/agentic-cms/pptx/live-verification/office-conflict.live.ts \
 *     --deck <PowerPoint-authored.pptx> --operator <your CMS email> --out <result.pptx> --confirm-live-write
 *
 * Then open <result.pptx> (or the printed OneDrive link) in PowerPoint and check that the
 * shape comment sits on the first slide's body shape and the slide comment on the last slide.
 */
import { config as loadEnv } from 'dotenv';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as JSZip from 'jszip';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { MicrosoftGraphService } from '../microsoft-graph.service';
import { PptxReaderService } from '../pptx-reader.service';
import { PptxCommentWriterService } from '../pptx-comment-writer.service';
import type { DeckContent, DriveItemRef, Finding } from '../pptx.types';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const FOLDER = 'otcr-ifmatch-verification';
export const CONCURRENT_EDIT_MARKER = 'CONCURRENT-EDIT-B-MARKER';

export const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

/** Deck B: deck A with the last slide's first text run prefixed by the marker. */
export async function deriveConcurrentEdit(deckA: Buffer, deck: DeckContent): Promise<Buffer> {
  const zip = await JSZip.loadAsync(deckA);
  const slidePath = `ppt/${deck.slides[deck.slides.length - 1].slideFile}`;
  const xml = await zip.file(slidePath)?.async('string');
  if (!xml || !/<a:t>/.test(xml)) throw new Error('The last slide needs a text run to edit.');
  zip.file(slidePath, xml.replace('<a:t>', `<a:t>${CONCURRENT_EDIT_MARKER}: `));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Findings exercising both anchor kinds: a shape on the first slide, the last slide itself. */
export function verificationFindings(deck: DeckContent): Finding[] {
  const first = deck.slides[0];
  const last = deck.slides[deck.slides.length - 1];
  const shape = first.shapes.find((s) => s.type === 'body' && s.creationId) ?? first.shapes.find((s) => s.creationId);
  if (!shape) throw new Error('The first slide needs a shape with a creationId; use a deck saved by PowerPoint.');
  return [
    { slideIndex: first.index, shapeId: shape.spId, severity: 'MATERIAL', comment: `Live verification: anchored to shape ${shape.spId} (${shape.name}).` },
    { slideIndex: last.index, severity: 'MINOR', comment: 'Live verification: slide-level comment.' },
  ];
}

export interface StaleWriteObservation {
  staleUploadStatus: number;
  eTagAfterEdit: string;
  eTagAfterStaleAttempt: string;
  shaB: string;
  shaAfterStaleAttempt: string;
  commentPartsAfterStaleAttempt: number;
}

export function staleWriteRejected(o: StaleWriteObservation): boolean {
  return o.staleUploadStatus === 412 && o.eTagAfterStaleAttempt === o.eTagAfterEdit &&
    o.shaAfterStaleAttempt === o.shaB && o.commentPartsAfterStaleAttempt === 0;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<number> {
  loadEnv();
  const deckPath = arg('--deck');
  const operator = arg('--operator');
  const outPath = arg('--out');
  if (!process.argv.includes('--confirm-live-write') || !deckPath || !operator || !outPath) {
    console.error('Usage: --deck <a.pptx> --operator <email> --out <result.pptx> --confirm-live-write');
    return 64;
  }
  const config = new ConfigService(process.env);
  const flags = new FeatureFlagsService(config);
  const gate = () => flags.assertAgenticCmsEnabledFor(operator);
  try { gate(); } catch {
    console.error('Agentic CMS is not enabled for this operator (AGENTIC_CMS_ENABLED / AGENTIC_CMS_ALLOWED_EMAILS).');
    return 1;
  }
  if (!config.get<string>('MSGRAPH_REFRESH_TOKEN')) {
    console.error('Use delegated credentials (MSGRAPH_REFRESH_TOKEN) so the test file lands in your own OneDrive.');
    return 1;
  }

  const graph = new MicrosoftGraphService(config);
  const reader = new PptxReaderService();
  const writer = new PptxCommentWriterService();
  const token: string = await (graph as any).getAccessToken();
  const auth = { Authorization: `Bearer ${token}` };
  const step = (name: string, detail: unknown) => console.log(JSON.stringify({ step: name, ...detail as object }));
  const countCommentParts = async (b: Buffer) =>
    Object.keys((await JSZip.loadAsync(b)).files).filter((p) => /^ppt\/comments\/.+\.xml$/.test(p)).length;

  const deckA = fs.readFileSync(deckPath);
  const parsedA = await reader.extractDeck(deckA);
  if (await countCommentParts(deckA)) throw new Error('Deck A must not contain comments.');
  const deckB = await deriveConcurrentEdit(deckA, parsedA);
  const name = `${FOLDER}/conflict-${new Date().toISOString().replace(/[:.]/g, '-')}.pptx`;

  // 1. New, dedicated file; conflictBehavior=fail refuses to touch anything that already exists.
  gate();
  const seedRes = await fetch(`${GRAPH}/me/drive/root:/${name}:/content?@microsoft.graph.conflictBehavior=fail`, {
    method: 'PUT', headers: { ...auth, 'Content-Type': PPTX_TYPE }, body: deckA as any, redirect: 'error',
  });
  const seed: any = await seedRes.json();
  if (seedRes.status !== 201) throw new Error(`Seeding failed: HTTP ${seedRes.status} ${seed?.error?.code ?? ''}`);
  const refA: DriveItemRef = { itemId: seed.id, driveId: seed.parentReference.driveId, eTag: seed.eTag, directDownload: false };
  step('seed A', { status: seedRes.status, file: name, eTagA: refA.eTag });

  // 2. Read A through the production path and build the post.
  const readA = await graph.downloadPptx(refA);
  const parsedReadA = await reader.extractDeck(readA);
  const postA = await writer.writeComments(readA, verificationFindings(parsedReadA), parsedReadA);
  step('read A and build post', { sha: sha256(readA), comments: postA.commentCount });
  if (postA.legacy || !postA.commentCount) throw new Error('The writer did not produce native comments for deck A.');

  // 3. Concurrent edit: replace content with B without a precondition, as another editor would.
  gate();
  const editRes = await fetch(`${GRAPH}/drives/${refA.driveId}/items/${refA.itemId}/content`, {
    method: 'PUT', headers: { ...auth, 'Content-Type': PPTX_TYPE }, body: deckB as any, redirect: 'error',
  });
  const edited: any = await editRes.json();
  step('concurrent edit to B', { status: editRes.status, eTagB: edited.eTag });
  if (!editRes.ok || edited.eTag === refA.eTag) throw new Error('The concurrent edit did not change the eTag.');

  // 4. Post against A through the production upload path.
  gate();
  const stale = await graph.uploadPptx(refA, postA.buffer, refA.eTag);
  const meta: any = await (await fetch(`${GRAPH}/drives/${refA.driveId}/items/${refA.itemId}?$select=eTag,webUrl`, { headers: auth })).json();
  const afterStale = await graph.downloadPptx({ ...refA, eTag: meta.eTag });
  const observation: StaleWriteObservation = {
    staleUploadStatus: stale.status, eTagAfterEdit: edited.eTag, eTagAfterStaleAttempt: meta.eTag,
    shaB: sha256(deckB), shaAfterStaleAttempt: sha256(afterStale), commentPartsAfterStaleAttempt: await countCommentParts(afterStale),
  };
  const rejected = staleWriteRejected(observation);
  step('stale post against A', { ...observation, verdict: rejected ? 'PASS' : 'FAIL' });
  if (!rejected) return 2;

  // 5. Fresh read of B, post with the current eTag, save the result for PowerPoint.
  const refB: DriveItemRef = { ...refA, eTag: meta.eTag };
  const parsedB = await reader.extractDeck(afterStale);
  const postB = await writer.writeComments(afterStale, verificationFindings(parsedB), parsedB);
  gate();
  const fresh = await graph.uploadPptx(refB, postB.buffer, refB.eTag);
  const ok = fresh.status >= 200 && fresh.status < 300 && Boolean(fresh.newEtag);
  step('current post against B', { status: fresh.status, eTag: fresh.newEtag, comments: postB.commentCount, verdict: ok ? 'PASS' : 'FAIL' });
  if (!ok) return 2;
  fs.writeFileSync(outPath, await graph.downloadPptx({ ...refB, eTag: fresh.newEtag! }));
  step('inspect in PowerPoint', { localFile: outPath, oneDrive: meta.webUrl });
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code), (error) => {
    console.error(`Live verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
