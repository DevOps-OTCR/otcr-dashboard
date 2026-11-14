import { Injectable, Logger } from '@nestjs/common';
import * as JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { DeckContent, Finding } from './pptx.types';

// cmLst/cm root and commentRel in slide extLst both use the 2018/8/main namespace.
// Source: [MS-PPTX] CT_Comment target namespace.
const NS_P188 = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main';
const NS_CMT  = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main';
// sldMkLst/sldMk use the 2013/main/command "pc" namespace (not 2018/10).
// Source: [MS-PPTX] CT_SlideMasterKeyList.
const NS_PC = 'http://schemas.microsoft.com/office/powerpoint/2013/main/command';
const NS_DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Source: [MS-PPTX] Author Part and Comment Part — source relationship values
const REL_TYPE_AUTHORS = 'http://schemas.microsoft.com/office/2018/10/relationships/authors';
const REL_TYPE_COMMENTS = 'http://schemas.microsoft.com/office/2018/10/relationships/comments';

const CONTENT_TYPE_AUTHORS = 'application/vnd.ms-powerpoint.authors+xml';
const CONTENT_TYPE_COMMENTS = 'application/vnd.ms-powerpoint.comments+xml';

// Source: [MS-PPTX] §2.16.1.3 Comment Extensions — ext URI for the commentRel element
const COMMENT_REL_EXT_URI = '{6950BFC3-D8DA-4A85-94F7-54DA5524770B}';

const BOT_USER_ID = 'otcr-bot';
const BOT_NAME = 'OTCR Bot';
const BOT_INITIALS = 'OB';
const BOT_PROVIDER_ID = '';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function makeParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) => ['Relationship', 'Override', 'Default', 'author', 'cm'].includes(name),
  });
}

function newGuid(): string {
  return crypto.randomUUID().toUpperCase();
}

function buildAuthorsXml(authorGuid: string): string {
  // Same p188:/2018/8/main namespace as comment files — verified from real PowerPoint output.
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<p188:authorLst xmlns:a="${NS_DRAWING}" xmlns:r="${NS_RELS}" xmlns:p188="${NS_CMT}">`,
    `  <p188:author id="{${authorGuid}}" name="${escapeXml(BOT_NAME)}" initials="${BOT_INITIALS}" userId="${BOT_USER_ID}" providerId="${BOT_PROVIDER_ID}"/>`,
    '</p188:authorLst>',
  ].join('\n');
}

function buildCommentEntry(
  c: { guid: string; sldId: string; sldCreationId?: string; shapeId?: string; shapeCreationId?: string; text: string; dt: string },
  authorGuid: string,
): string {
  const spMk = c.shapeId
    ? `      <pc:spMk spId="${escapeXml(c.shapeId)}"${c.shapeCreationId ? ` creationId="${escapeXml(c.shapeCreationId)}"` : ''}/>`
    : null;
  return [
    `  <p188:cm id="{${c.guid}}" authorId="{${authorGuid}}" created="${c.dt}">`,
    `    <pc:sldMkLst xmlns:pc="${NS_PC}">`,
    `      <pc:docMk/>`,
    `      <pc:sldMk cId="0" sldId="${escapeXml(c.sldId)}"/>`,
    spMk,
    '    </pc:sldMkLst>',
    '    <p188:txBody>',
    `      <a:bodyPr/>`,
    `      <a:lstStyle/>`,
    `      <a:p>`,
    '        <a:r>',
    `          <a:rPr lang="en-US"/>`,
    `          <a:t>${escapeXml(c.text)}</a:t>`,
    '        </a:r>',
    '      </a:p>',
    '    </p188:txBody>',
    '  </p188:cm>',
  ].filter((l) => l !== null).join('\n');
}

function buildCommentXml(
  comments: Array<{ guid: string; sldId: string; sldCreationId?: string; shapeId?: string; shapeCreationId?: string; text: string; dt: string }>,
  authorGuid: string,
): string {
  const cms = comments.map((c) => buildCommentEntry(c, authorGuid)).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<p188:cmLst xmlns:a="${NS_DRAWING}" xmlns:r="${NS_RELS}" xmlns:p188="${NS_CMT}">`,
    cms,
    '</p188:cmLst>',
  ].join('\n');
}

function parseRelationships(xml: string): any[] {
  const parser = makeParser();
  const doc = parser.parse(xml);
  return doc?.Relationships?.Relationship ?? [];
}

function getNextRelId(_existing: any[]): string {
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `rOtcr${hex}`;
}

function insertRelationship(relsXml: string, id: string, type: string, target: string): string {
  const entry = `  <Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
  if (relsXml.includes('</Relationships>')) {
    return relsXml.replace('</Relationships>', `${entry}\n</Relationships>`);
  }
  // Self-closing <Relationships .../> — expand it before inserting.
  if (relsXml.includes('<Relationships')) {
    return relsXml.replace(/<Relationships([^>]*)\/>/, `<Relationships$1>\n${entry}\n</Relationships>`);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    entry,
    '</Relationships>',
  ].join('\n');
}

function insertContentTypeOverride(ctXml: string, partName: string, contentType: string): string {
  if (ctXml.includes(`PartName="${partName}"`)) return ctXml;
  const entry = `  <Override PartName="${partName}" ContentType="${contentType}"/>`;
  return ctXml.replace('</Types>', `${entry}\n</Types>`);
}

function hasLegacyComments(zip: any): boolean {
  return !!(
    zip.file('ppt/commentAuthors.xml') ||
    zip.file('ppt/comments/slideComments.xml')
  );
}

@Injectable()
export class PptxCommentWriterService {
  private readonly log = new Logger(PptxCommentWriterService.name);

  async writeComments(buffer: Buffer, findings: Finding[], deck: DeckContent): Promise<{ buffer: Buffer; legacy: boolean; commentCount: number; sanitized: boolean }> {
    const zip = await (JSZip as any).loadAsync(buffer);

    if (hasLegacyComments(zip)) {
      this.log.warn('Deck uses legacy comment format — skipping native comment write');
      return { buffer, legacy: true, commentCount: 0, sanitized: false };
    }

    // Clear any comment files written by an older version of this code (wrong namespaces).
    // Replace them with an empty valid container so PowerPoint stops flagging the file as
    // damaged. The main loop below will append correct XML to slides that have new findings.
    const sanitized = await this.sanitizeStaleCommentFiles(zip);

    const authorGuid = await this.ensureAuthor(zip);
    const presRelsPath = 'ppt/_rels/presentation.xml.rels';
    await this.ensureAuthorsRelationship(zip, presRelsPath, authorGuid);

    const findingsBySlide = new Map<number, Finding[]>();
    for (const f of findings) {
      if (!findingsBySlide.has(f.slideIndex)) findingsBySlide.set(f.slideIndex, []);
      findingsBySlide.get(f.slideIndex)!.push(f);
    }

    const dt = new Date().toISOString();

    for (const [slideIndex, slidefindings] of findingsBySlide) {
      const slide = deck.slides.find((s) => s.index === slideIndex);
      if (!slide) {
        this.log.warn(`Slide ${slideIndex} not found in deck — skipping ${slidefindings.length} findings`);
        continue;
      }

      const comments = slidefindings.map((f) => {
        const shape = f.shapeId ? slide.shapes.find((s) => s.spId === f.shapeId) : undefined;
        return {
          guid: newGuid(),
          sldId: slide.sldId,
          sldCreationId: slide.creationId,
          shapeId: f.shapeId,
          shapeCreationId: shape?.creationId,
          text: `[${f.severity}] ${f.comment}`,
          dt,
        };
      });

      const commentPartPath = `ppt/comments/modernComment_${slide.sldId}.xml`;
      await this.writeCommentPart(zip, commentPartPath, comments, authorGuid, slide.sldId);

      const slideName = slide.slideFile.split('/').pop()!;
      const slideRelsPath = `ppt/slides/_rels/${slideName}.rels`;
      const relId = await this.addSlideCommentRelationship(zip, slideRelsPath, commentPartPath);
      await this.addSlideExtLst(zip, `ppt/${slide.slideFile}`, relId);

      let ctXml = await zip.file('[Content_Types].xml')?.async('string') ?? '';
      ctXml = insertContentTypeOverride(ctXml, `/${commentPartPath}`, CONTENT_TYPE_COMMENTS);
      zip.file('[Content_Types].xml', ctXml);
    }

    // Delete comment files that are no longer referenced by any slide rels. These are left over
    // from previous bot runs that wrote wrong sldId values (e.g. "rId2" instead of a uint) or
    // used a deprecated relationship type. OPC-compliant parsers should ignore unreferenced parts,
    // but PowerPoint may scan all ppt/comments/*.xml and trigger a repair dialog on invalid content.
    await this.deleteOrphanedCommentFiles(zip);

    const commentCount = await this.countComments(zip);
    if (commentCount < findings.length) this.log.warn(`Post-write validation: expected ${findings.length} comments, found ${commentCount}`);

    const result = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { buffer: result, legacy: false, commentCount, sanitized };
  }

  private async ensureAuthor(zip: any): Promise<string> {
    const existing = await zip.file('ppt/authors.xml')?.async('string');
    if (existing) {
      const parser = makeParser();
      const doc = parser.parse(existing);
      // Handle both <p188:authorLst> (our format) and <authors> (PowerPoint native format).
      // removeNSPrefix strips p188: so <p188:authorLst> → authorLst, <authors> → authors.
      const authors: any[] = doc?.authorLst?.author ?? doc?.authors?.author ?? [];
      const bot = authors.find((a) => a['@_userId'] === BOT_USER_ID);
      if (bot) {
        const guid = (bot['@_id'] ?? '').replace(/^\{|\}$/g, '');
        // Fix stale providerId written by earlier code — replace globally since only our
        // bot author uses this literal value; real users have "AD" or "OAuth" or "".
        const fixed = existing.replace(/providerId="None"/g, `providerId="${BOT_PROVIDER_ID}"`);
        if (fixed !== existing) zip.file('ppt/authors.xml', fixed);
        return guid;
      }
      const guid = newGuid();
      // Append in the file's native format to avoid mixing namespace styles.
      const entry = existing.includes('</authors>')
        ? `  <author id="{${guid}}" name="${escapeXml(BOT_NAME)}" initials="${BOT_INITIALS}" userId="${BOT_USER_ID}" providerId="${BOT_PROVIDER_ID}"/>`
        : `  <p188:author id="{${guid}}" name="${escapeXml(BOT_NAME)}" initials="${BOT_INITIALS}" userId="${BOT_USER_ID}" providerId="${BOT_PROVIDER_ID}"/>`;
      const closeTag = existing.includes('</authors>') ? '</authors>' : '</p188:authorLst>';
      const updated = existing.replace(closeTag, `${entry}\n${closeTag}`);
      zip.file('ppt/authors.xml', updated);

      let ctXml = await zip.file('[Content_Types].xml')?.async('string') ?? '';
      ctXml = insertContentTypeOverride(ctXml, '/ppt/authors.xml', CONTENT_TYPE_AUTHORS);
      zip.file('[Content_Types].xml', ctXml);

      return guid;
    }

    const guid = newGuid();
    zip.file('ppt/authors.xml', buildAuthorsXml(guid));

    let ctXml = await zip.file('[Content_Types].xml')?.async('string') ?? '';
    ctXml = insertContentTypeOverride(ctXml, '/ppt/authors.xml', CONTENT_TYPE_AUTHORS);
    zip.file('[Content_Types].xml', ctXml);

    return guid;
  }

  private async ensureAuthorsRelationship(zip: any, presRelsPath: string, _authorGuid: string): Promise<void> {
    const existing = await zip.file(presRelsPath)?.async('string') ?? '';
    if (existing.includes(REL_TYPE_AUTHORS)) return;

    const relId = getNextRelId(parseRelationships(existing));
    const updated = insertRelationship(existing, relId, REL_TYPE_AUTHORS, 'authors.xml');
    zip.file(presRelsPath, updated);
  }

  private async writeCommentPart(
    zip: any,
    path: string,
    comments: Array<{ guid: string; sldId: string; sldCreationId?: string; shapeId?: string; shapeCreationId?: string; text: string; dt: string }>,
    authorGuid: string,
    sldId: string,
  ): Promise<void> {
    const existing = await zip.file(path)?.async('string');
    if (existing) {
      // Overwrite any file that lacks the current correct namespace (catches both the old p188:
      // prefixed format and the old 2016/09 namespace this code previously used).
      if (!existing.includes(NS_CMT)) {
        zip.file(path, buildCommentXml(comments, authorGuid));
        return;
      }
      // Preserve ALL existing entries (human and bot alike) — only append comments whose
      // text isn't already present, to stay idempotent across repeated bot runs.
      const fresh = comments.filter((c) => !existing.includes(`<a:t>${escapeXml(c.text)}</a:t>`));
      if (!fresh.length) return;
      const newEntries = fresh.map((c) => buildCommentEntry(c, authorGuid)).join('\n');
      const updated = existing.replace('</p188:cmLst>', `${newEntries}\n</p188:cmLst>`);
      zip.file(path, updated);
    } else {
      zip.file(path, buildCommentXml(comments, authorGuid));
    }
  }

  private async addSlideCommentRelationship(zip: any, relsPath: string, commentPartPath: string): Promise<string> {
    const existing = await zip.file(relsPath)?.async('string') ?? '';
    const target = `../comments/${commentPartPath.split('/').pop()}`;

    // Strip stale entries from earlier bot versions that used a deprecated relationship type.
    const cleaned = existing.replace(
      /<Relationship\b[^>]*Type="http:\/\/schemas\.microsoft\.com\/office\/2016\/relationships\/modernComment"[^>]*\/>/g,
      '',
    );

    const rels = parseRelationships(cleaned);
    const found = rels.find((r: any) => r['@_Target'] === target);

    if (found && found['@_Type'] === REL_TYPE_COMMENTS) {
      // Target already wired correctly — just persist the stale-entry cleanup if anything changed.
      if (cleaned !== existing) zip.file(relsPath, cleaned);
      return found['@_Id'] ?? '';
    }

    // Not found, or found with a stale/wrong relationship type — add/replace with correct type.
    const relId = found?.['@_Id'] ?? getNextRelId(rels);
    let relsXml = cleaned;
    if (found) {
      // Strip the wrong-type entry so we can re-add it with the correct type.
      relsXml = relsXml.replace(/<Relationship\b[^>]*\/>/g, (match) =>
        match.includes(`Id="${found['@_Id']}"`) ? '' : match,
      );
    }
    const updated = insertRelationship(relsXml, relId, REL_TYPE_COMMENTS, target);
    zip.file(relsPath, updated);
    return relId;
  }

  private async addSlideExtLst(zip: any, slideFilePath: string, relId: string): Promise<void> {
    if (!relId) return;
    const slideXml = await zip.file(slideFilePath)?.async('string');
    if (!slideXml) return;

    // Strip ALL commentRel p:ext blocks (correct or stale) so we write exactly one clean entry.
    const stripped = slideXml.replace(/<p:ext\b[^>]*>[\s\S]*?<\/p:ext>/g, (match) =>
      match.includes('commentRel') ? '' : match,
    );

    const extEntry = [
      `    <p:ext uri="${COMMENT_REL_EXT_URI}">`,
      `      <p188:commentRel xmlns:p188="${NS_P188}" r:id="${relId}"/>`,
      `    </p:ext>`,
    ].join('\n');

    // Match only the slide-level extLst (immediately before </p:sld>), not shape extLsts.
    let updated: string;
    if (/<\/p:extLst>\s*<\/p:sld>/.test(stripped)) {
      updated = stripped.replace(/<\/p:extLst>(\s*<\/p:sld>)/, `${extEntry}\n  </p:extLst>$1`);
    } else {
      const extLst = `  <p:extLst>\n${extEntry}\n  </p:extLst>\n`;
      updated = stripped.replace('</p:sld>', `${extLst}</p:sld>`);
    }
    zip.file(slideFilePath, updated);
  }

  private async sanitizeStaleCommentFiles(zip: any): Promise<boolean> {
    let found = false;
    const files: string[] = Object.keys((zip as any).files);

    // Fix bad comment parts (ppt/comments/*.xml).
    for (const path of files) {
      if (!path.startsWith('ppt/comments/') || !path.endsWith('.xml')) continue;
      const xml = await zip.file(path)?.async('string') ?? '';
      // Sanitize any file that has cmLst but not the correct 2018/8/main namespace.
      // This catches: old 2016/09 files, old p188: files using the wrong URI, and anything
      // else that doesn't match what PowerPoint expects.
      if (!xml.includes('cmLst') || xml.includes(NS_CMT)) continue;
      // Replace bad-namespace content with an empty, valid container.
      // writeCommentPart will append new findings to this file if needed.
      zip.file(path, [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<p188:cmLst xmlns:a="${NS_DRAWING}" xmlns:r="${NS_RELS}" xmlns:p188="${NS_CMT}">`,
        `</p188:cmLst>`,
      ].join('\n'));
      this.log.debug(`Sanitized stale bad-namespace comment file: ${path}`);
      found = true;
    }

    // Fix authors.xml that lacks the correct 2018/8/main namespace.
    // Old code wrote <authors xmlns="…2018/10/powerpoint/author"> — convert all variants
    // to the correct <p188:authorLst xmlns:p188="…2018/8/main"> format verified from PowerPoint.
    const authXml = await zip.file('ppt/authors.xml')?.async('string') ?? '';
    if (authXml && !authXml.includes(NS_CMT)) {
      const fixed = authXml
        .replace(/<[a-z]*:?authorLst[^>]*>/, `<p188:authorLst xmlns:a="${NS_DRAWING}" xmlns:r="${NS_RELS}" xmlns:p188="${NS_CMT}">`)
        .replace(/<\/[a-z]*:?authorLst>/, '</p188:authorLst>')
        .replace(/<[a-z]*:?author(\s)/g, '<p188:author$1')
        .replace(/<\/[a-z]*:?author>/g, '</p188:author>');
      zip.file('ppt/authors.xml', fixed);
      this.log.debug('Sanitized wrong-namespace authors.xml');
      found = true;
    }

    // Strip ALL commentRel ext blocks from ALL slide XML files.
    // Previous bot runs left ext blocks on every slide (old code wrote them for all slides
    // regardless of findings). Slides not updated this run would keep those stale blocks,
    // causing PowerPoint to trigger the repair dialog. Clearing them all here is safe because
    // writeComments always writes the COMPLETE set of findings for the current review run;
    // the main loop (addSlideExtLst) will re-add correct blocks only for slides with findings.
    // Strip commentRel ext blocks with WRONG URI only — correct {6950BFC3} blocks may reference
    // human comments and must be preserved. addSlideExtLst handles the strip+rewrite for slides
    // that receive new bot findings.
    const slideFiles = files.filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    for (const path of slideFiles) {
      const xml = await zip.file(path)?.async('string') ?? '';
      if (!xml.includes('commentRel')) continue;
      const stripped = xml.replace(/<p:ext\b[^>]*>[\s\S]*?<\/p:ext>/g, (match) => {
        if (!match.includes('commentRel')) return match;
        if (match.includes(COMMENT_REL_EXT_URI)) return match;
        return '';
      });
      if (stripped !== xml) {
        zip.file(path, stripped);
        this.log.debug(`Stripped wrong-URI commentRel ext block(s) from: ${path}`);
        found = true;
      }
    }

    // Strip stale 2016-era comment relationship entries from all slide rels files.
    // The 2016 rel type was used by old code; the correct type is 2018/10/relationships/comments.
    // addSlideCommentRelationship already strips these when it processes a slide with findings,
    // but slides without findings keep the stale entries — clean them here for all slides.
    const slideRelsFiles = files.filter(f => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(f));
    for (const path of slideRelsFiles) {
      const xml = await zip.file(path)?.async('string') ?? '';
      if (!xml.includes('2016/relationships/modernComment')) continue;
      const stripped = xml.replace(
        /<Relationship\b[^>]*2016\/relationships\/modernComment[^>]*\/>/g,
        '',
      );
      if (stripped !== xml) {
        zip.file(path, stripped);
        this.log.debug(`Stripped stale 2016 comment rel from: ${path}`);
        found = true;
      }
    }

    return found;
  }

  private async deleteOrphanedCommentFiles(zip: any): Promise<void> {
    const files: string[] = Object.keys((zip as any).files);

    // Collect every comment file target still referenced by a slide rels file.
    const referenced = new Set<string>();
    const relsFiles = files.filter(f => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(f));
    for (const path of relsFiles) {
      const xml = await zip.file(path)?.async('string') ?? '';
      for (const m of xml.matchAll(/Target="\.\.\/comments\/([^"]+)"/g)) {
        referenced.add(`ppt/comments/${m[1]}`);
      }
    }

    // Remove any ppt/comments/*.xml not reachable from any slide.
    const commentFiles = files.filter(f => f.startsWith('ppt/comments/') && f.endsWith('.xml'));
    for (const cf of commentFiles) {
      if (referenced.has(cf)) continue;
      zip.remove(cf);
      this.log.debug(`Removed orphaned comment file: ${cf}`);

      // Remove the matching content-type override so [Content_Types].xml stays consistent.
      let ctXml = await zip.file('[Content_Types].xml')?.async('string') ?? '';
      const escaped = cf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const updated = ctXml.replace(
        new RegExp(`\\s*<Override PartName="\\/${escaped}"[^/]*\\/>`),
        '',
      );
      if (updated !== ctXml) zip.file('[Content_Types].xml', updated);
    }
  }

  private async countComments(zip: any): Promise<number> {
    let total = 0;
    const files: string[] = Object.keys((zip as any).files);
    for (const path of files) {
      if (path.startsWith('ppt/comments/') && path.endsWith('.xml')) {
        const xml = await zip.file(path)?.async('string') ?? '';
        total += xml.match(/<(?:[a-z0-9]+:)?cm[\s>]/g)?.length ?? 0;
      }
    }
    return total;
  }
}
