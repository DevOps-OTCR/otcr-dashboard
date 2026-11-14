/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger } from '@nestjs/common';
import * as JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { DeckContent, ShapeInfo, SlideContent } from './pptx.types';

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
  });
}

function getText(txBody: any): string[] {
  if (!txBody) return [];
  const paragraphs: any[] = Array.isArray(txBody.p) ? txBody.p : txBody.p ? [txBody.p] : [];
  return paragraphs.map((p) => {
    const runs: any[] = Array.isArray(p.r) ? p.r : p.r ? [p.r] : [];
    const lineBreaks: any[] = Array.isArray(p.br) ? p.br : [];
    if (!runs.length && !lineBreaks.length) return '';
    return runs.map((r) => (typeof r.t === 'string' ? r.t : '')).join('');
  }).filter(Boolean);
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
    const creationId = findCreationId(sp.extLst);
    const textLines = getText(sp.txBody);
    shapes.push({
      spId,
      name,
      type: shapeType(sp),
      hasCreationId: !!creationId,
      creationId,
      text: textLines.join(' '),
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

  return shapes;
}

@Injectable()
export class PptxReaderService {
  private readonly log = new Logger(PptxReaderService.name);

  async extractDeck(buffer: Buffer): Promise<DeckContent> {
    const zip = await (JSZip as any).loadAsync(buffer);
    const parser = makeParser();

    const presXml = await zip.file('ppt/presentation.xml')?.async('string');
    if (!presXml) throw new Error('Not a valid PPTX: missing ppt/presentation.xml');
    const pres = parser.parse(presXml);

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

    // With removeNSPrefix:true, both id="256" and r:id="rId1" collapse to @_id,
    // so r:id overwrites id and we lose the numeric sldId. Use a regex pass to
    // build a map from relationship-id → numeric sldId before the parsed loop.
    const sldIdByRel = new Map<string, string>();
    for (const m of presXml.matchAll(/<[a-z]*:?sldId\s[^>]*\bid="(\d+)"[^>]*\br:id="([^"]+)"/g)) sldIdByRel.set(m[2], m[1]);
    for (const m of presXml.matchAll(/<[a-z]*:?sldId\s[^>]*\br:id="([^"]+)"[^>]*\bid="(\d+)"/g)) sldIdByRel.set(m[1], m[2]);

    const sldIdList = pres?.presentation?.sldIdLst?.sldId ?? [];
    const sldIds: any[] = Array.isArray(sldIdList) ? sldIdList : [sldIdList];

    const slides: SlideContent[] = [];
    for (let i = 0; i < sldIds.length; i++) {
      const sldIdEntry = sldIds[i];
      // After ns stripping, @_id holds the r:id value ("rId1") — use it to look
      // up the numeric sldId ("256") that we extracted via the regex map above.
      const rId = sldIdEntry['@_id'] ?? '';
      const sldId = sldIdByRel.get(rId) ?? String(i + 256);
      const target = slideRelMap.get(rId);
      if (!target) {
        this.log.warn(`Slide rId ${rId} not found in relationships`);
        continue;
      }

      const slideFile = target.startsWith('/') ? target.slice(1) : `ppt/${target.replace(/^\.\.\//, '')}`;
      const normalizedTarget = target.replace(/^\.\.\//, '');
      const slideXml = await zip.file(`ppt/${normalizedTarget}`)?.async('string')
        ?? await zip.file(slideFile)?.async('string');

      if (!slideXml) {
        this.log.warn(`Slide file not found: ${slideFile}`);
        continue;
      }

      const slideDoc = parser.parse(slideXml);
      const sld = slideDoc?.sld ?? slideDoc?.wksp ?? slideDoc;
      const spTree = sld?.cSld?.spTree;
      const shapes = parseShapes(spTree);

      const title = shapes.find((s) => s.type === 'title')?.text ?? '';
      const bodyText = shapes.filter((s) => s.type === 'body').map((s) => s.text).filter(Boolean);
      const slideCreationId = findCreationId(sld?.extLst);

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
      const slideName = slideTarget.split('/').pop()?.replace('.xml', '') ?? '';
      const relsPath = `ppt/slides/_rels/${slideName}.xml.rels`;
      const relsXml = await zip.file(relsPath)?.async('string');
      if (!relsXml) return '';

      const rels = parser.parse(relsXml);
      const relationships: any[] = rels?.Relationships?.Relationship ?? [];
      const notesRel = relationships.find((r: any) => r['@_Type'] === NOTES_REL_TYPE);
      if (!notesRel) return '';

      const notesTarget = notesRel['@_Target'].replace(/^\.\.\//, '');
      const notesXml = await zip.file(`ppt/${notesTarget}`)?.async('string');
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
