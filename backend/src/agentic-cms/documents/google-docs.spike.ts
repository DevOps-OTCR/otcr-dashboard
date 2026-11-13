/*
 * THROWAWAY SPIKE: answers the open questions about Google Docs anchored comments
 * against a real doc, without the CMS database. Delete once findings are written up.
 *
 *   cd backend
 *   npx ts-node src/agentic-cms/documents/google-docs.spike.ts <doc-url>                      # read only
 *   npx ts-node src/agentic-cms/documents/google-docs.spike.ts <doc-url> --quote "..." --comment "..."
 *
 * Options: --scope <oauth-scope-url>  try a different scope (question 4)
 *          --revision <id> | --no-revision  override requiredRevisionId (question 6)
 * Env (backend/.env, never committed): GOOGLE_DOCS_CLIENT_EMAIL, GOOGLE_DOCS_PRIVATE_KEY,
 *   the usual Agentic CMS flag/allowlist, and SPIKE_EMAIL (your allowlisted address).
 * Writes raw responses to backend/.spike-out/ (git-ignored); the raw doc becomes a test fixture.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { findQuote, flattenDocument, parseGoogleDocLink, textHash } from './google-doc';
import { GoogleDocsClient, GoogleDocsError } from './google-docs.client';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.argv[2];
  const link = url && parseGoogleDocLink(url);
  if (!link) throw new Error('First argument must be a https://docs.google.com/document/d/... link');

  const config = { get: (key: string) => process.env[key] } as ConfigService;
  // A separate entry point is not covered by the HTTP guard, so check the flag here too.
  const flags = new FeatureFlagsService(config);
  flags.assertAgenticCmsEnabledFor(process.env.SPIKE_EMAIL);

  const client = new GoogleDocsClient(config);
  if (arg('scope')) client.scope = arg('scope');
  console.log(`Service account: ${client.serviceAccountEmail()}  scope: ${client.scope}`);

  const out = join(process.cwd(), '.spike-out');
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const save = (name: string, data: unknown) => writeFileSync(join(out, `${stamp}-${name}.json`), JSON.stringify(data, null, 2));

  const doc = await client.getDocument(link.documentId);
  save('document', doc);
  const paragraphs = flattenDocument(doc);
  const snapshot = { documentId: link.documentId, title: doc.title, revisionId: doc.revisionId ?? null, textHash: textHash(paragraphs), capturedAt: new Date().toISOString() };
  save('snapshot', { ...snapshot, paragraphs });
  console.log('\nREAD OK', snapshot);
  console.log(`Paragraphs: ${paragraphs.length}, tabs: ${new Set(paragraphs.map(p => p.tabId)).size}`);
  console.log(`revisionId present (Q9): ${Boolean(doc.revisionId)}`);
  for (const p of paragraphs.filter(p => p.text.trim()).slice(0, 8)) console.log(`  [${p.n}] (${p.section ?? '-'}) ${p.text.slice(0, 90)}`);

  const quote = arg('quote');
  const comment = arg('comment');
  if (!quote || !comment) return console.log('\nNo --quote/--comment given; read-only run finished.');

  const match = findQuote(paragraphs, quote);
  console.log('\nANCHOR', match);
  const feedback = { document: snapshot, comments: [] as unknown[] };
  if ('reason' in match) {
    feedback.comments.push({ quote, comment, section: null, placement: 'fallback', nativeCommentId: null, fallbackReason: match.reason });
    save('feedback', feedback);
    return console.log('Quote did not anchor; written as fallback feedback.');
  }

  const revision = process.argv.includes('--no-revision') ? null : arg('revision') ?? doc.revisionId ?? null;
  flags.assertAgenticCmsEnabledFor(process.env.SPIKE_EMAIL); // recheck right before the external write
  try {
    const result = await client.insertComment(link.documentId, { content: comment, startIndex: match.startIndex, endIndex: match.endIndex, tabId: match.tabId }, revision);
    save('insert-comment-response', result.raw);
    feedback.comments.push({ quote, comment, section: match.section, placement: 'native', nativeCommentId: result.commentId, fallbackReason: null });
    console.log(`\nCOMMENT OK (requiredRevisionId=${revision ?? 'none'}) commentId=${result.commentId}`);
    console.log(`Google anchored to: "${result.anchoredText}"  next revisionId: ${result.nextRevisionId}`);
    console.log('Raw reply:', JSON.stringify(result.raw));
    console.log('Now open the doc and check the comment is attached to the quoted text, and who it shows as author (Q2).');
  } catch (error) {
    if (!(error instanceof GoogleDocsError)) throw error;
    feedback.comments.push({ quote, comment, section: match.section, placement: 'fallback', nativeCommentId: null, fallbackReason: error.reason });
    console.log(`\nCOMMENT FAILED reason=${error.reason} status=${error.status}\n${error.detail}`);
  }
  save('feedback', feedback);
}

main().catch(error => {
  if (error instanceof GoogleDocsError) console.error(`FAILED reason=${error.reason} status=${error.status}\n${error.detail}`);
  else console.error(error);
  process.exitCode = 1;
});
