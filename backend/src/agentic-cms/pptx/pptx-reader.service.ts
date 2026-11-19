/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger } from '@nestjs/common';
import { posix } from 'node:path';
import * as JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { DeckContent, ShapeInfo, SlideContent } from './pptx.types';

export async function loadPptx(buffer: Buffer): Promise<any> {
  if (buffer.length > 25 * 1024 * 1024) throw new Error('PPTX exceeds the 25 MB review limit.');
  const zip = await (JSZip as any).loadAsync(buffer);
  const files: any[] = Object.values(zip.files).filter((file: any) => !file.dir);
  if (files.length > 2000) throw new Error('PPTX contains too many parts.');
  let total = 0;
  for (const file of files) {
    // ponytail: JSZip exposes central-directory sizes through _data; fail closed if its shape changes.
    const size = file._data?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0 || size > 50 * 1024 * 1024 ||
        (/\.(xml|rels)$/.test(file.name) && size > 2 * 1024 * 1024)) throw new Error('PPTX part exceeds review limits.');
    total += size;
  }
  if (total > 100 * 1024 * 1024) throw new Error('PPTX expanded content exceeds review limits.');
  let expanded = 0;
  for (const file of files) {
    const isXml = /\.(xml|rels)$/.test(file.name);
    const limit = (isXml ? 2 : 50) * 1024 * 1024;
    const content = await new Promise<Buffer>((resolve, reject) => {
      const stream = file.nodeStream('nodebuffer');
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        expanded += chunk.length;
        if (size > limit || expanded > 100 * 1024 * 1024) {
          stream.destroy(new Error('PPTX expanded content exceeds review limits.'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks, size)));
    });
    if (isXml) {
      const xml = content.toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
        throw new Error('PPTX contains unsupported or invalid XML.');
      }
    }
    zip.file(file.name, content);
  }
  return zip;
}

const SLIDE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const NOTES_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';

function makeParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) =>
      ['Relationship', 'sldId', 'sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp', 'p', 'r', 'ext', 'br'].includes(name),
    parseAttributeValue: false,
    parseTagValue: false,
    processEntities: false,
    // Text boxes come back as raw XML so getText can read runs and breaks in the order they were written.
    stopNodes: ['*.txBody'],
  });
}

/**
 * Decodes the references XML allows in text: the five named ones and numeric ones. Anything else is
 * left as written. One pass, so "&amp;lt;" becomes "&lt;" and not "<". A number that is not a valid
 * character becomes U+FFFD instead of failing the read.
 */
export function decodeXmlText(text: string): string {
  return text.replace(/&(?:#([0-9]{1,8})|#x([0-9a-fA-F]{1,8})|(lt|gt|quot|apos|amp));/g, (_, dec, hex, name) => {
    if (name) return { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[name as string]!;
    const code = hex ? Number.parseInt(hex, 16) : Number.parseInt(dec, 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\uFFFD';
  });
}

const TAG = /<(\/?)(?:[\w.-]+:)?([\w.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const T_CLOSE = /<\/(?:[\w.-]+:)?t\s*>/g;

/**
 * The text of one text box, a string per paragraph. Runs are joined exactly as written, so spaces
 * at a run boundary survive, and a soft break (a:br) becomes a newline where it stands.
 */
function getText(txBody: unknown): string[] {
  if (typeof txBody !== 'string') return [];
  const xml = txBody.replace(/<!--[\s\S]*?-->/g, '');
  const paragraphs: string[] = [];
  let current = '';
  const tag = new RegExp(TAG.source, 'g');
  for (let match = tag.exec(xml); match; match = tag.exec(xml)) {
    const [, closing, name, , selfClosing] = match;
    if (name === 'p') {
      if (closing) { paragraphs.push(current); current = ''; }
    } else if (name === 'br' && !closing) {
      current += '\n';
    } else if (name === 't' && !closing && !selfClosing) {
      T_CLOSE.lastIndex = tag.lastIndex;
      const end = T_CLOSE.exec(xml);
      if (!end) break;
      current += xml.slice(tag.lastIndex, end.index).split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
        .map((part) => (part.startsWith('<![CDATA[') ? part.slice(9, -3) : decodeXmlText(part))).join('');
      tag.lastIndex = end.index + end[0].length;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.filter((paragraph) => paragraph.trim());
}

function findCreationId(extLst: any): string | undefined {
  if (!extLst) return undefined;
  const exts: any[] = Array.isArray(extLst.ext) ? extLst.ext : extLst.ext ? [extLst.ext] : [];
  for (const ext of exts) {
    if (ext.creationId) {
      const val = ext.creationId['@_val'] ?? ext.creationId['@_id'];
      if (val) return val;
    }
  }
  return undefined;
}

function shapeType(sp: any): ShapeInfo['type'] {
  const phType = sp.nvSpPr?.nvPr?.ph?.['@_type'];
  if (phType === 'title' || phType === 'ctrTitle') return 'title';
  if (phType === 'body' || phType === 'subTitle' || sp.nvSpPr?.nvPr?.ph) return 'body';
  return 'other';
}

function parseShapes(spTree: any): ShapeInfo[] {
  if (!spTree) return [];
  const shapes: ShapeInfo[] = [];

  const spList: any[] = Array.isArray(spTree.sp) ? spTree.sp : spTree.sp ? [spTree.sp] : [];
  for (const sp of spList) {
    const cNvPr = sp.nvSpPr?.cNvPr;
    const spId = String(cNvPr?.['@_id'] ?? '');
    const name = String(cNvPr?.['@_name'] ?? '');
    // a16:creationId lives in p:nvSpPr/p:cNvPr/a:extLst.
    const creationId = findCreationId(cNvPr?.extLst) ?? findCreationId(sp.extLst);
    const textLines = getText(sp.txBody);
    shapes.push({
      spId,
      name,
      type: shapeType(sp),
      hasCreationId: !!creationId,
      creationId,
      text: textLines.join('\n'),
    });
  }

  const pics: any[] = Array.isArray(spTree.pic) ? spTree.pic : spTree.pic ? [spTree.pic] : [];
  for (const pic of pics) {
    const cNvPr = pic.nvPicPr?.cNvPr;
    const spId = String(cNvPr?.['@_id'] ?? '');
    const name = String(cNvPr?.['@_name'] ?? '');
    shapes.push({ spId, name, type: 'picture', hasCreationId: false, text: '' });
  }

  const frames: any[] = Array.isArray(spTree.graphicFrame) ? spTree.graphicFrame : spTree.graphicFrame ? [spTree.graphicFrame] : [];
  for (const frame of frames) {
    const cNvPr = frame.nvGraphicFramePr?.cNvPr;
    const spId = String(cNvPr?.['@_id'] ?? '');
    const name = String(cNvPr?.['@_name'] ?? '');
    const graphicType = frame.graphic?.graphicData?.['@_uri'] ?? '';
    const type = graphicType.includes('chart') ? 'chart' : graphicType.includes('table') ? 'table' : 'other';
    shapes.push({ spId, name, type, hasCreationId: false, text: '' });
  }

  const groups = Array.isArray(spTree.grpSp) ? spTree.grpSp : spTree.grpSp ? [spTree.grpSp] : [];
  for (const group of groups) shapes.push(...parseShapes(group));
  return shapes;
}

@Injectable()
export class PptxReaderService {
  private readonly log = new Logger(PptxReaderService.name);

  async extractDeck(buffer: Buffer): Promise<DeckContent> {
    const zip = await loadPptx(buffer);
    const parser = makeParser();

    const presXml = await zip.file('ppt/presentation.xml')?.async('string');
    if (!presXml) throw new Error('Not a valid PPTX: missing ppt/presentation.xml');
    if (/<!DOCTYPE|<!ENTITY/i.test(presXml)) throw new Error('PPTX XML entities are unsupported.');

    const presRelsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
    if (!presRelsXml) throw new Error('Not a valid PPTX: missing ppt/_rels/presentation.xml.rels');
    const presRels = parser.parse(presRelsXml);
    const relationships: any[] = presRels?.Relationships?.Relationship ?? [];

    const slideRelMap = new Map<string, string>();
    for (const rel of relationships) {
      if (rel['@_Type'] === SLIDE_REL_TYPE) {
        slideRelMap.set(rel['@_Id'], rel['@_Target']);
      }
    }

    // Preserve the distinct numeric id and namespaced relationship id, regardless of attribute order.
    const idParser = new XMLParser({ ignoreAttributes: false, parseAttributeValue: false, processEntities: false });
    const sldIds = [...presXml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?sldId\b[^>]*\/?>/g)].map(([tag]) => {
      const parsed = Object.values(idParser.parse(tag.replace(/\/?>$/, '/>')))[0] as Record<string, string>;
      return { id: parsed['@_id'], rel: Object.entries(parsed).find(([key]) => key.startsWith('@_') && key.endsWith(':id'))?.[1] };
    });
    if (sldIds.length > 200) throw new Error('PPTX exceeds the 200 slide review limit.');

    const slides: SlideContent[] = [];
    for (let i = 0; i < sldIds.length; i++) {
      const sldIdEntry = sldIds[i];
      const rId = sldIdEntry.rel;
      const sldId = sldIdEntry.id;
      const target = slideRelMap.get(rId);
      if (!target || !/^\d+$/.test(sldId ?? '')) throw new Error('PPTX has an unresolved slide reference.');
      const fullPath = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join('ppt', target));
      if (!fullPath.startsWith('ppt/slides/') || fullPath.includes('..')) throw new Error('PPTX slide target is unsupported.');
      const normalizedTarget = fullPath.slice(4);
      const slideXml = await zip.file(fullPath)?.async('string');
      if (!slideXml) throw new Error('PPTX slide part is missing.');
      if (/<!DOCTYPE|<!ENTITY/i.test(slideXml)) throw new Error('PPTX XML entities are unsupported.');

      const slideDoc = parser.parse(slideXml);
      const sld = slideDoc?.sld ?? slideDoc?.wksp ?? slideDoc;
      const spTree = sld?.cSld?.spTree;
      const shapes = parseShapes(spTree);

      const title = shapes.find((s) => s.type === 'title')?.text ?? '';
      const bodyText = shapes.filter((s) => s.type === 'body').map((s) => s.text).filter(Boolean);
      // PowerPoint writes p14:creationId under p:cSld/p:extLst.
      const slideCreationId = findCreationId(sld?.cSld?.extLst) ?? findCreationId(sld?.extLst);

      const speakerNotes = await this.extractNotes(zip, parser, normalizedTarget);

      slides.push({
        index: i + 1,
        sldId,
        slideFile: normalizedTarget,
        creationId: slideCreationId,
        title,
        bodyText,
        speakerNotes,
        shapes,
      });
    }

    return { slides, slideCount: slides.length };
  }

  private async extractNotes(zip: any, parser: any, slideTarget: string): Promise<string> {
    try {
      const slideDir = posix.join('ppt', posix.dirname(slideTarget));
      const relsPath = posix.join(slideDir, '_rels', `${posix.basename(slideTarget)}.rels`);
      const relsXml = await zip.file(relsPath)?.async('string');
      if (!relsXml) return '';

      const rels = parser.parse(relsXml);
      const relationships: any[] = rels?.Relationships?.Relationship ?? [];
      const notesRel = relationships.find((r: any) => r['@_Type'] === NOTES_REL_TYPE);
      if (!notesRel) return '';

      if (notesRel['@_TargetMode'] === 'External') return '';
      const target = notesRel['@_Target'];
      const notesTarget = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join(slideDir, target));
      const notesXml = await zip.file(notesTarget)?.async('string');
      if (!notesXml) return '';

      const notesDoc = parser.parse(notesXml);
      const spTree = notesDoc?.notes?.cSld?.spTree;
      const shapes = parseShapes(spTree);
      return shapes
        .filter((s) => s.type === 'body')
        .map((s) => s.text)
        .filter(Boolean)
        .join('\n');
    } catch {
      return '';
    }
  }
}
