/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger } from '@nestjs/common';
import { loadPptx } from './pptx-reader.service';
import { XMLParser } from 'fast-xml-parser';
import type { DeckContent, Finding } from './pptx.types';

// cmLst/cm root and commentRel in slide extLst both use the 2018/8/main namespace.
// Source: [MS-PPTX] CT_Comment target namespace.
const NS_P188 = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main';
const NS_CMT  = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main';
// sldMkLst/sldMk use the 2013/main/command "pc" namespace (not 2018/10).
// Source: [MS-PPTX] CT_SlideMasterKeyList.
const NS_PC = 'http://schemas.microsoft.com/office/powerpoint/2013/main/command';
// Drawing-element monikers (ac:deMkLst, ac:spMk). Source: [MS-ODRAWXML] 2.29.3.
const NS_AC = 'http://schemas.microsoft.com/office/drawing/2013/main/command';
const NS_DRAWING ='http://schemas.openxmlformats.org/drawingml/2006/main';
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
  // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these characters.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) throw new Error('Comment contains unsupported XML control characters.');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function makeParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    processEntities: false,
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
  // EG_CommentAnchor is a choice: pc:sldMkLst anchors to the slide; ac:deMkLst (docMk, sldMk,
  // ac:spMk id+creationId) anchors to a drawing element. Source: [MS-PPTX] 2.16.3.3 CT_Comment,
  // [MS-ODRAWXML] 2.29.3.17 CT_ShapeMoniker. cId is the slide's p14:creationId/@val.
  const sldMk = `      <pc:sldMk cId="${escapeXml(c.sldCreationId ?? '0')}" sldId="${escapeXml(c.sldId)}"/>`;
  const anchor = c.shapeId && c.shapeCreationId
    ? [
        `    <ac:deMkLst xmlns:ac="${NS_AC}" xmlns:pc="${NS_PC}">`,
        '      <pc:docMk/>',
        sldMk,
        `      <ac:spMk id="${escapeXml(c.shapeId)}" creationId="${escapeXml(c.shapeCreationId)}"/>`,
        '    </ac:deMkLst>',
      ]
    : [`    <pc:sldMkLst xmlns:pc="${NS_PC}">`, '      <pc:docMk/>', sldMk, '    </pc:sldMkLst>'];
  return [
    `  <p188:cm id="{${c.guid}}" authorId="{${authorGuid}}" created="${c.dt}">`,
    ...anchor,
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

function getNextRelId(): string {
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
  const overrides: any[] = makeParser().parse(ctXml)?.Types?.Override ?? [];
  if (overrides.some((part) => part['@_PartName'] === partName)) return ctXml;
  const entry = `  <Override PartName="${partName}" ContentType="${contentType}"/>`;
  return ctXml.replace('</Types>', `${entry}\n</Types>`);
}

function supportsPackageRoot(xml: string, name: string, namespace: string): boolean {
  const doc = new XMLParser({ ignoreAttributes: false, ignoreDeclaration: true, processEntities: false }).parse(xml);
  return Object.keys(doc).length === 1 && doc[name]?.['@_xmlns'] === namespace &&
    (xml.includes(`</${name}>`) || (name === 'Relationships' && /<Relationships\b[^>]*\/>/.test(xml)));
}

// Our writer names parts modernComment_<sldId>.xml; PowerPoint renames them on save to
// modernComment_<sldId hex>_<slide creationId hex>.xml. Accept both, nothing else.
const COMMENT_PART = /^modernComment_(?:\d+|[0-9A-F]+_[0-9A-F]+)\.xml$/i;

function commentPartBelongsTo(name: string, sldId: string): boolean {
  const ours = /^modernComment_(\d+)\.xml$/.exec(name);
  if (ours) return ours[1] === sldId;
  const saved = /^modernComment_([0-9A-F]+)_[0-9A-F]+\.xml$/i.exec(name);
  return !!saved && parseInt(saved[1], 16) === Number(sldId);
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
    const zip = await loadPptx(buffer);

    if (hasLegacyComments(zip)) {
      this.log.warn('Deck uses legacy comment format — skipping native comment write');
      return { buffer, legacy: true, commentCount: 0, sanitized: false };
    }

    // ponytail: append only to our known bot-only layout; preserve unfamiliar/human comments byte-for-byte.
    const existingAuthors = await zip.file('ppt/authors.xml')?.async('string');
    let existingBotId: string | undefined;
    if (existingAuthors) {
      const authors = makeParser().parse(existingAuthors)?.authorLst?.author;
      if (!existingAuthors.includes('</p188:authorLst>') || !Array.isArray(authors) || authors.length !== 1 ||
          authors[0]['@_userId'] !== BOT_USER_ID || !existingAuthors.includes(NS_CMT)) {
        return { buffer, legacy: true, commentCount: 0, sanitized: false };
      }
      existingBotId = authors[0]['@_id'];
    }
    for (const path of Object.keys(zip.files)) {
      if (!path.startsWith('ppt/comments/') || !path.endsWith('.xml')) continue;
      const xml = await zip.file(path)?.async('string') ?? '';
      const entries = makeParser().parse(xml)?.cmLst?.cm;
      if (!path.startsWith('ppt/comments/') || !COMMENT_PART.test(path.slice('ppt/comments/'.length)) || !xml.includes(NS_CMT) ||
          !xml.includes('</p188:cmLst>') || !existingBotId ||
          !Array.isArray(entries) || entries.some((entry: any) => entry['@_authorId'] !== existingBotId)) {
        return { buffer, legacy: true, commentCount: 0, sanitized: false };
      }
    }
    const preserve = () => ({ buffer, legacy: true, commentCount: 0, sanitized: false });
    const presentationRelsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string') ?? '';
    const contentTypesXml = await zip.file('[Content_Types].xml')?.async('string') ?? '';
    // String insertion only supports these familiar package roots; preserve other valid layouts.
    if (!supportsPackageRoot(presentationRelsXml, 'Relationships', 'http://schemas.openxmlformats.org/package/2006/relationships') ||
        !supportsPackageRoot(contentTypesXml, 'Types', 'http://schemas.openxmlformats.org/package/2006/content-types')) return preserve();
    const presentationRels = parseRelationships(presentationRelsXml);
    const authorRels = presentationRels.filter((rel: any) => /author/i.test(rel['@_Type'] ?? ''));
    if (authorRels.length && (authorRels.length !== 1 || authorRels[0]['@_Type'] !== REL_TYPE_AUTHORS ||
        authorRels[0]['@_Target'] !== 'authors.xml' || authorRels[0]['@_TargetMode'] === 'External' || !existingBotId)) return preserve();
    const contentTypes = makeParser().parse(contentTypesXml)?.Types?.Override ?? [];
    if (contentTypes.some((part: any) => /comments|authors/i.test(part['@_ContentType'] ?? '') &&
        part['@_PartName'] !== '/ppt/authors.xml' &&
        !((part['@_PartName'] ?? '').startsWith('/ppt/comments/') && COMMENT_PART.test(part['@_PartName'].slice('/ppt/comments/'.length))))) return preserve();
    // Existing bot comment part per slide, under whichever name the last writer (us or PowerPoint) gave it.
    const existingParts = new Map<string, string>();
    for (const slide of deck.slides) {
      if (!/^slides\/[^/]+\.xml$/.test(slide.slideFile)) return preserve();
      const xml = await zip.file(`ppt/${slide.slideFile}`)?.async('string') ?? '';
      if (!xml.includes('</p:sld>')) return preserve();
      const slideName = slide.slideFile.split('/').pop()!;
      const relsXml = await zip.file(`ppt/slides/_rels/${slideName}.rels`)?.async('string');
      if (relsXml && !supportsPackageRoot(relsXml, 'Relationships', 'http://schemas.openxmlformats.org/package/2006/relationships')) return preserve();
      const rels = relsXml ? parseRelationships(relsXml) : [];
      const commentRels = rels.filter((rel: any) => /comment/i.test(rel['@_Type'] ?? ''));
      const commentRefs = [...xml.matchAll(/<(?:[\w.-]+:)?commentRel\b[^>]*\br:id=["']([^"']+)["'][^>]*\/?>/g)];
      if (commentRels.length || xml.includes('commentRel')) {
        const rel = commentRels[0];
        const name = /^\.\.\/comments\/([^/]+)$/.exec(rel?.['@_Target'] ?? '')?.[1] ?? '';
        const partPath = `ppt/comments/${name}`;
        if (!existingBotId || commentRels.length !== 1 || commentRefs.length !== 1 ||
            rel['@_Type'] !== REL_TYPE_COMMENTS || rel['@_TargetMode'] === 'External' ||
            !commentPartBelongsTo(name, slide.sldId) || commentRefs[0][1] !== rel['@_Id'] ||
            !zip.file(partPath) || [...existingParts.values()].includes(partPath)) return preserve();
        existingParts.set(slide.slideFile, partPath);
      }
    }
    let commentCount = 0;

    const authorGuid = await this.ensureAuthor(zip);
    const presRelsPath = 'ppt/_rels/presentation.xml.rels';
    await this.ensureAuthorsRelationship(zip, presRelsPath);

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
          // A shape moniker needs the shape's creationId; without it, anchor to the slide.
          shapeId: shape?.creationId ? f.shapeId : undefined,
          shapeCreationId: shape?.creationId,
          text: `[${f.severity}] ${f.comment}`,
          dt,
        };
      });

      const commentPartPath = existingParts.get(slide.slideFile) ?? `ppt/comments/modernComment_${slide.sldId}.xml`;      commentCount += await this.writeCommentPart(zip, commentPartPath, comments, authorGuid);

      const slideName = slide.slideFile.split('/').pop()!;
      const slideRelsPath = `ppt/slides/_rels/${slideName}.rels`;
      const relId = await this.addSlideCommentRelationship(zip, slideRelsPath, commentPartPath);
      await this.addSlideExtLst(zip, `ppt/${slide.slideFile}`, relId);

      let ctXml = await zip.file('[Content_Types].xml')?.async('string') ?? '';
      ctXml = insertContentTypeOverride(ctXml, `/${commentPartPath}`, CONTENT_TYPE_COMMENTS);
      zip.file('[Content_Types].xml', ctXml);
    }

    const result = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { buffer: result, legacy: false, commentCount, sanitized: false };
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

  private async ensureAuthorsRelationship(zip: any, presRelsPath: string): Promise<void> {
    const existing = await zip.file(presRelsPath)?.async('string') ?? '';
    if (existing.includes(REL_TYPE_AUTHORS)) return;

    const relId = getNextRelId();
    const updated = insertRelationship(existing, relId, REL_TYPE_AUTHORS, 'authors.xml');
    zip.file(presRelsPath, updated);
  }

  private async writeCommentPart(
    zip: any,
    path: string,
    comments: Array<{ guid: string; sldId: string; sldCreationId?: string; shapeId?: string; shapeCreationId?: string; text: string; dt: string }>,
    authorGuid: string,
  ): Promise<number> {
    const existing = await zip.file(path)?.async('string');
    if (existing) {
      // Overwrite any file that lacks the current correct namespace (catches both the old p188:
      // prefixed format and the old 2016/09 namespace this code previously used).
      if (!existing.includes(NS_CMT)) {
        zip.file(path, buildCommentXml(comments, authorGuid));
        return comments.length;
      }
      // Match both text and shape anchor; identical wording can legitimately target two shapes.
      const entries = makeParser().parse(existing)?.cmLst?.cm ?? [];
      const seen = new Set(entries.map((entry: any) => JSON.stringify([
        // deMkLst/spMk@id is the correct anchor; sldMkLst/spMk@spId matches comments from older builds.
        entry.txBody?.p?.r?.t ?? '', String(entry.deMkLst?.spMk?.['@_id'] ?? entry.sldMkLst?.spMk?.['@_spId'] ?? ''),
      ])));
      const fresh = comments.filter((comment) => {
        const key = JSON.stringify([escapeXml(comment.text), comment.shapeId ?? '']);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!fresh.length) return 0;
      const newEntries = fresh.map((c) => buildCommentEntry(c, authorGuid)).join('\n');
      const updated = existing.replace('</p188:cmLst>', `${newEntries}\n</p188:cmLst>`);
      zip.file(path, updated);
      return fresh.length;
    } else {
      const seen = new Set<string>();
      const fresh = comments.filter((comment) => {
        const key = JSON.stringify([comment.text, comment.shapeId ?? '']);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      zip.file(path, buildCommentXml(fresh, authorGuid));
      return fresh.length;
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
    const relId = found?.['@_Id'] ?? getNextRelId();
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
      `      <p188:commentRel xmlns:p188="${NS_P188}" xmlns:r="${NS_RELS}" r:id="${relId}"/>`,
      `    </p:ext>`,
    ].join('\n');

    // Match only the slide-level extLst (immediately before </p:sld>), not shape extLsts.
    let updated: string;
    if (/<\/p:extLst>\s*<\/p:sld>/.test(stripped)) {
      updated = stripped.replace(/<\/p:extLst>(\s*<\/p:sld>)/, `${extEntry}\n  </p:extLst>$1`);
    } else if (/<p:extLst\s*\/>\s*<\/p:sld>/.test(stripped)) {
      updated = stripped.replace(/<p:extLst\s*\/>(\s*<\/p:sld>)/, `<p:extLst>\n${extEntry}\n</p:extLst>$1`);
    } else {
      const extLst = `  <p:extLst>\n${extEntry}\n  </p:extLst>\n`;
      updated = stripped.replace('</p:sld>', `${extLst}</p:sld>`);
    }
    zip.file(slideFilePath, updated);
  }

}
