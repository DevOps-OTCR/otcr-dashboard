/* eslint-disable @typescript-eslint/no-explicit-any */
import * as JSZip from 'jszip';
import type { Finding } from './pptx.types';
import { PptxCommentWriterService } from './pptx-comment-writer.service';
import { PptxReaderService } from './pptx-reader.service';

// ---------------------------------------------------------------------------
// Minimal PPTX builder
// A PPTX is a ZIP with specific XML parts. These helpers produce the smallest
// valid structure the reader and writer can round-trip through.
// ---------------------------------------------------------------------------

interface SlideSpec {
  title: string;
  body: string[];
  sldId?: number;
  shapeExtLst?: boolean; // include a shape-level extLst (simulates hyperlinks/media)
}

function slideXml(spec: SlideSpec): string {
  const bodyShapes = spec.body.map((line, i) => `
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="${3 + i}" name="Content Placeholder ${2 + i}"/>
        <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
        <p:nvPr><p:ph type="body" idx="1"/></p:nvPr>
      </p:nvSpPr>
      <p:txBody>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:t>${line}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>`).join('\n');

  const shapeExtLst = spec.shapeExtLst
    ? `\n      <p:extLst><p:ext uri="{FAKE-SHAPE-EXT}"><fake:data xmlns:fake="urn:fake"/></p:ext></p:extLst>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/>
          <a:p><a:r><a:t>${spec.title}</a:t></a:r></a:p>
        </p:txBody>${shapeExtLst}
      </p:sp>
      ${bodyShapes}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

async function buildPptx(slides: SlideSpec[], opts: { legacyComments?: boolean } = {}): Promise<Buffer> {
  const zip = new (JSZip as any)();

  const sldIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('\n    ');
  const presRels = slides.map((_, i) =>
    `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('\n');

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n  ')}
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    ${sldIds}
  </p:sldIdLst>
</p:presentation>`);

  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${presRels}
</Relationships>`);

  for (let i = 0; i < slides.length; i++) {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(slides[i]));
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  }

  if (opts.legacyComments) {
    zip.file('ppt/commentAuthors.xml', '<commentAuthorLst xmlns="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PptxReaderService', () => {
  const reader = new PptxReaderService();

  it('extracts slide count, title, body text and sldId from a single-slide deck', async () => {
    const buf = await buildPptx([{ title: 'Market Analysis', body: ['E-bike market grew 12% in 2025'] }]);
    const deck = await reader.extractDeck(buf);

    expect(deck.slideCount).toBe(1);
    expect(deck.slides[0].index).toBe(1);
    expect(deck.slides[0].sldId).toBe('256');
    expect(deck.slides[0].title).toBe('Market Analysis');
    expect(deck.slides[0].bodyText).toEqual(['E-bike market grew 12% in 2025']);
  });

  it('extracts multiple slides with correct indices and titles', async () => {
    const buf = await buildPptx([
      { title: 'Introduction', body: [] },
      { title: 'Analysis', body: ['Revenue up', 'Costs stable'] },
      { title: 'Recommendation', body: [] },
    ]);
    const deck = await reader.extractDeck(buf);

    expect(deck.slideCount).toBe(3);
    expect(deck.slides.map((s) => s.title)).toEqual(['Introduction', 'Analysis', 'Recommendation']);
    expect(deck.slides.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(deck.slides[1].bodyText).toEqual(['Revenue up', 'Costs stable']);
  });

  it('assigns consecutive sldIds starting from 256', async () => {
    const buf = await buildPptx([{ title: 'A', body: [] }, { title: 'B', body: [] }]);
    const deck = await reader.extractDeck(buf);
    expect(deck.slides[0].sldId).toBe('256');
    expect(deck.slides[1].sldId).toBe('257');
  });

  it('records the slideFile path used by the writer', async () => {
    const buf = await buildPptx([{ title: 'T', body: [] }]);
    const deck = await reader.extractDeck(buf);
    expect(deck.slides[0].slideFile).toBe('slides/slide1.xml');
  });

  it('throws on a buffer that is not a valid PPTX', async () => {
    await expect(reader.extractDeck(Buffer.from('not a zip'))).rejects.toThrow();
  });
});

describe('PptxCommentWriterService', () => {
  const reader = new PptxReaderService();
  const writer = new PptxCommentWriterService();

  it('writes a comment and the modified ZIP contains the comment XML', async () => {
    const buf = await buildPptx([{ title: 'Slide', body: [] }]);
    const deck = await reader.extractDeck(buf);
    const findings: Finding[] = [{ slideIndex: 1, severity: 'MATERIAL', comment: 'Missing data source' }];

    const { buffer: modified, legacy, commentCount } = await writer.writeComments(buf, findings, deck);

    expect(legacy).toBe(false);
    expect(commentCount).toBe(1);
    const zip = await (JSZip as any).loadAsync(modified);
    const commentPaths = Object.keys((zip as any).files).filter((f: string) => f.startsWith('ppt/comments/') && f.endsWith('.xml'));
    expect(commentPaths).toHaveLength(1);

    const commentXml: string = await zip.file(commentPaths[0]).async('string');
    expect(commentXml).toContain('[MATERIAL] Missing data source');
    expect(commentXml).toContain('sldId="256"');
    // Author name lives in ppt/authors.xml; the comment only carries the GUID reference.
    const authorsXml: string = await zip.file('ppt/authors.xml').async('string');
    expect(authorsXml).toContain('OTCR Bot');
  });

  it('writes comments for multiple slides', async () => {
    const buf = await buildPptx([
      { title: 'Slide 1', body: [] },
      { title: 'Slide 2', body: [] },
    ]);
    const deck = await reader.extractDeck(buf);
    const findings: Finding[] = [
      { slideIndex: 1, severity: 'BLOCKING', comment: 'Wrong chart' },
      { slideIndex: 2, severity: 'MINOR', comment: 'Typo on line 3' },
    ];

    const { buffer: modified } = await writer.writeComments(buf, findings, deck);

    const zip = await (JSZip as any).loadAsync(modified);
    const commentPaths: string[] = Object.keys((zip as any).files).filter((f: string) => f.startsWith('ppt/comments/') && f.endsWith('.xml'));
    expect(commentPaths).toHaveLength(2);

    const allCommentText = await Promise.all(commentPaths.map((p: string) => zip.file(p).async('string')));
    const combined = allCommentText.join('\n');
    expect(combined).toContain('[BLOCKING] Wrong chart');
    expect(combined).toContain('[MINOR] Typo on line 3');
  });

  it('detects legacy comment format and returns the original buffer unchanged', async () => {
    const buf = await buildPptx([{ title: 'Old deck', body: [] }], { legacyComments: true });
    const deck = await reader.extractDeck(buf);

    const { buffer: out, legacy } = await writer.writeComments(buf, [{ slideIndex: 1, severity: 'MINOR', comment: 'x' }], deck);

    expect(legacy).toBe(true);
    expect(out).toBe(buf); // same reference — writer returned early
  });

  it('injects commentRel at slide level even when shapes have their own extLst', async () => {
    const buf = await buildPptx([{ title: 'Linked slide', body: ['Click here'], shapeExtLst: true }]);
    const deck = await reader.extractDeck(buf);

    const { buffer: modified, commentCount } = await writer.writeComments(buf, [{ slideIndex: 1, severity: 'MINOR', comment: 'check' }], deck);

    expect(commentCount).toBe(1);
    const zip = await (JSZip as any).loadAsync(modified);
    const slideXml: string = await zip.file('ppt/slides/slide1.xml').async('string');
    // commentRel must appear inside the slide-level extLst (right before </p:sld>), not inside the shape extLst
    expect(slideXml).toMatch(/commentRel[\s\S]*<\/p:sld>/);
    // The shape extLst must NOT contain commentRel
    const shapeExtLstEnd = slideXml.indexOf('</p:cSld>');
    expect(slideXml.slice(0, shapeExtLstEnd)).not.toContain('commentRel');
  });

  it('does not duplicate a comment that already exists on the slide', async () => {
    const buf = await buildPptx([{ title: 'Slide', body: [] }]);
    const deck = await reader.extractDeck(buf);
    const findings: Finding[] = [{ slideIndex: 1, severity: 'MINOR', comment: 'Fix this' }];

    const { buffer: once } = await writer.writeComments(buf, findings, deck);
    const deckAfterFirst = await reader.extractDeck(once);
    const { buffer: twice, commentCount } = await writer.writeComments(once, findings, deckAfterFirst);

    expect(commentCount).toBe(0);
    const zip = await (JSZip as any).loadAsync(twice);
    const commentPaths: string[] = Object.keys((zip as any).files).filter((f: string) => f.startsWith('ppt/comments/') && f.endsWith('.xml'));
    const xml: string = await zip.file(commentPaths[0]).async('string');
    const matches = xml.match(/\[MINOR\] Fix this/g);
    expect(matches).toHaveLength(1);
  });

  it('adds the authors entry and presentation relationship on the first comment write', async () => {
    const buf = await buildPptx([{ title: 'Fresh', body: [] }]);
    const deck = await reader.extractDeck(buf);

    const { buffer: modified } = await writer.writeComments(buf, [{ slideIndex: 1, severity: 'MINOR', comment: 'check' }], deck);

    const zip = await (JSZip as any).loadAsync(modified);
    const authorsXml: string = await zip.file('ppt/authors.xml').async('string');
    expect(authorsXml).toContain('OTCR Bot');
    expect(authorsXml).toContain('otcr-bot');

    const presRelsXml: string = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    expect(presRelsXml).toContain('relationships/author');
  });
});

describe('PptxCommentWriterService — PowerPoint cross-reference integrity', () => {
  // Every r:id, authorId, and PartName that PowerPoint resolves at open time must
  // be resolvable within the same ZIP. This suite proves the file is structurally
  // complete — if all of these pass, there is no missing link that could cause
  // comments to be silently ignored.
  const reader = new PptxReaderService();
  const writer = new PptxCommentWriterService();

  it('every slide rels file contains a relationship entry pointing to its comment file', async () => {
    const buf = await buildPptx([{ title: 'S1', body: [] }, { title: 'S2', body: [] }]);
    const deck = await reader.extractDeck(buf);
    const findings: Finding[] = [
      { slideIndex: 1, severity: 'MINOR', comment: 'Fix slide 1' },
      { slideIndex: 2, severity: 'MATERIAL', comment: 'Fix slide 2' },
    ];

    const { buffer: modified } = await writer.writeComments(buf, findings, deck);
    const zip = await (JSZip as any).loadAsync(modified);

    for (let i = 1; i <= 2; i++) {
      const relsXml: string = await zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)?.async('string') ?? '';
      // Must be an open tag, not self-closing, and must reference the comments rel type
      expect(relsXml).toContain('2018/10/relationships/comments');
      expect(relsXml).toContain('Target="../comments/');
      // Must NOT still be self-closing
      expect(relsXml).toContain('</Relationships>');
    }
  });

  it('every r:id in a slide commentRel resolves to a relationship in that slide\'s rels file', async () => {
    const buf = await buildPptx([{ title: 'S1', body: [] }, { title: 'S2', body: [] }]);
    const deck = await reader.extractDeck(buf);
    const { buffer: modified } = await writer.writeComments(buf, [
      { slideIndex: 1, severity: 'MINOR', comment: 'c1' },
      { slideIndex: 2, severity: 'MINOR', comment: 'c2' },
    ], deck);
    const zip = await (JSZip as any).loadAsync(modified);

    for (let i = 1; i <= 2; i++) {
      const slideXml: string = await zip.file(`ppt/slides/slide${i}.xml`)?.async('string') ?? '';
      const relsXml: string = await zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)?.async('string') ?? '';

      // Extract the r:id from the commentRel element
      const relIdMatch = slideXml.match(/commentRel[^>]+r:id="([^"]+)"/);
      expect(relIdMatch).not.toBeNull();
      const relId = relIdMatch![1];

      // That ID must appear in the rels file
      expect(relsXml).toContain(`Id="${relId}"`);
    }
  });

  it('every authorId in every comment resolves to an author in authors.xml', async () => {
    const buf = await buildPptx([{ title: 'S1', body: [] }]);
    const deck = await reader.extractDeck(buf);
    const { buffer: modified } = await writer.writeComments(buf, [
      { slideIndex: 1, severity: 'MINOR', comment: 'check' },
    ], deck);
    const zip = await (JSZip as any).loadAsync(modified);

    const authorsXml: string = await zip.file('ppt/authors.xml')?.async('string') ?? '';
    const commentFiles = Object.keys((zip as any).files).filter((f: string) => f.startsWith('ppt/comments/') && f.endsWith('.xml'));

    for (const path of commentFiles) {
      const commentXml: string = await zip.file(path)?.async('string') ?? '';
      const authorIds = [...commentXml.matchAll(/authorId="\{([^}]+)\}"/g)].map(m => m[1]);
      for (const id of authorIds) {
        expect(authorsXml).toContain(`id="{${id}}"`);
      }
    }
  });

  it('[Content_Types].xml has an Override entry for every comment file and authors.xml', async () => {
    const buf = await buildPptx([{ title: 'S1', body: [] }, { title: 'S2', body: [] }]);
    const deck = await reader.extractDeck(buf);
    const { buffer: modified } = await writer.writeComments(buf, [
      { slideIndex: 1, severity: 'MINOR', comment: 'c1' },
      { slideIndex: 2, severity: 'MINOR', comment: 'c2' },
    ], deck);
    const zip = await (JSZip as any).loadAsync(modified);

    const ctXml: string = await zip.file('[Content_Types].xml')?.async('string') ?? '';
    expect(ctXml).toContain('vnd.ms-powerpoint.authors+xml');
    expect(ctXml).toContain('vnd.ms-powerpoint.comments+xml');

    const commentFiles = Object.keys((zip as any).files).filter((f: string) => f.startsWith('ppt/comments/') && f.endsWith('.xml'));
    for (const path of commentFiles) {
      expect(ctXml).toContain(`PartName="/${path}"`);
    }
  });

  it('presentation rels has the authors relationship pointing to authors.xml', async () => {
    const buf = await buildPptx([{ title: 'S1', body: [] }]);
    const deck = await reader.extractDeck(buf);
    const { buffer: modified } = await writer.writeComments(buf, [
      { slideIndex: 1, severity: 'MINOR', comment: 'check' },
    ], deck);
    const zip = await (JSZip as any).loadAsync(modified);

    const presRels: string = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string') ?? '';
    expect(presRels).toContain('2018/10/relationships/authors');
    expect(presRels).toContain('Target="authors.xml"');
    expect(presRels).toContain('</Relationships>');
  });
});

describe('PptxReaderService + PptxCommentWriterService round-trip', () => {
  const reader = new PptxReaderService();
  const writer = new PptxCommentWriterService();

  it('modified PPTX is still parseable by the reader with the same slides', async () => {
    const buf = await buildPptx([
      { title: 'Title Slide', body: ['Prepared by OTCR'] },
      { title: 'Market Overview', body: ['$2B market', 'Growing 15% YoY'] },
    ]);
    const deck = await reader.extractDeck(buf);
    const findings: Finding[] = [
      { slideIndex: 1, severity: 'MINOR', comment: 'Add client logo' },
      { slideIndex: 2, severity: 'MATERIAL', comment: 'Cite the $2B figure' },
    ];

    const { buffer: modified } = await writer.writeComments(buf, findings, deck);
    const reparsed = await reader.extractDeck(modified);

    expect(reparsed.slideCount).toBe(2);
    expect(reparsed.slides[0].title).toBe('Title Slide');
    expect(reparsed.slides[1].title).toBe('Market Overview');
    expect(reparsed.slides[1].bodyText).toEqual(['$2B market', 'Growing 15% YoY']);
  });

  it('skips a finding whose slideIndex has no matching slide', async () => {
    const buf = await buildPptx([{ title: 'Only slide', body: [] }]);
    const deck = await reader.extractDeck(buf);

    const { buffer: modified, legacy, commentCount } = await writer.writeComments(
      buf,
      [{ slideIndex: 99, severity: 'MINOR', comment: 'Ghost slide' }],
      deck,
    );

    expect(legacy).toBe(false);
    expect(commentCount).toBe(0);
    const zip = await (JSZip as any).loadAsync(modified);
    const commentPaths: string[] = Object.keys((zip as any).files).filter((f: string) => f.startsWith('ppt/comments/') && f.endsWith('.xml'));
    expect(commentPaths).toHaveLength(0);
  });
});


describe('PowerPoint adversarial regressions', () => {
  const reader = new PptxReaderService();
  const writer = new PptxCommentWriterService();

  it('preserves numeric slide text and slide identity when attributes are reversed', async () => {
    const zip = await (JSZip as any).loadAsync(await buildPptx([{ title: '2026', body: ['123.45'] }]));
    const presentation = await zip.file('ppt/presentation.xml').async('string');
    zip.file('ppt/presentation.xml', presentation.replace('id="256" r:id="rId1"', "r:id='rId1' id='912'"));
    const deck = await reader.extractDeck(await zip.generateAsync({ type: 'nodebuffer' }));
    expect(deck.slides[0]).toMatchObject({ sldId: '912', title: '2026', bodyText: ['123.45'] });
  });

  it('follows presentation order rather than slide filenames', async () => {
    const zip = await (JSZip as any).loadAsync(await buildPptx([{ title: 'A', body: [] }, { title: 'B', body: [] }]));
    const presentation = await zip.file('ppt/presentation.xml').async('string');
    zip.file('ppt/presentation.xml', presentation.replace('<p:sldId id="256" r:id="rId1"/>', '<p:sldId id="256" r:id="rId2"/>')
      .replace('<p:sldId id="257" r:id="rId2"/>', '<p:sldId id="257" r:id="rId1"/>'));
    const deck = await reader.extractDeck(await zip.generateAsync({ type: 'nodebuffer' }));
    expect(deck.slides.map((slide) => slide.title)).toEqual(['B', 'A']);
    expect(deck.slides[0].slideFile).toBe('slides/slide2.xml');
  });

  it('preserves unfamiliar human comment parts byte-for-byte rather than repairing or unlinking them', async () => {
    const zip = await (JSZip as any).loadAsync(await buildPptx([{ title: 'A', body: [] }]));
    zip.file('ppt/comments/human.xml', '<cmLst xmlns="urn:other-comments"><cm>Human feedback</cm></cmLst>');
    const original = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await writer.writeComments(original, [{ slideIndex: 1, severity: 'MINOR', comment: 'New feedback' }], await reader.extractDeck(original));
    expect(result.legacy).toBe(true);
    expect(result.buffer).toBe(original);
    const unchanged = await (JSZip as any).loadAsync(result.buffer);
    expect(await unchanged.file('ppt/comments/human.xml').async('string')).toContain('Human feedback');
  });

  it('preserves human comment parts referenced outside the conventional comments directory', async () => {
    const zip = await (JSZip as any).loadAsync(await buildPptx([{ title: 'A', body: [] }]));
    zip.file('custom/human-feedback.xml', '<cmLst xmlns="http://schemas.microsoft.com/office/powerpoint/2018/8/main"><cm>Human feedback</cm></cmLst>');
    zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="human" Type="http://schemas.microsoft.com/office/2018/10/relationships/comments" Target="../../custom/human-feedback.xml"/></Relationships>');
    const original = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await writer.writeComments(original, [{ slideIndex: 1, severity: 'MINOR', comment: 'New feedback' }], await reader.extractDeck(original));
    expect(result.legacy).toBe(true);
    expect(result.buffer).toBe(original);
    const unchanged = await (JSZip as any).loadAsync(result.buffer);
    expect(await unchanged.file('custom/human-feedback.xml').async('string')).toContain('Human feedback');
    expect(await unchanged.file('ppt/slides/_rels/slide1.xml.rels').async('string')).toContain('../../custom/human-feedback.xml');
  });

  it.each([
    ['ppt/_rels/presentation.xml.rels', 'Relationships', 'Relationship'],
    ['ppt/slides/_rels/slide1.xml.rels', 'Relationships', 'Relationship'],
    ['[Content_Types].xml', 'Types', 'Override'],
  ])('preserves unfamiliar prefixed package roots in %s without modifying the ZIP', async (path, root, child) => {
    const zip = await (JSZip as any).loadAsync(await buildPptx([{ title: 'A', body: [] }]));
    let xml = await zip.file(path).async('string');
    if (path.includes('slides/_rels/')) {
      xml = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="image1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>';
    }
    xml = xml.replace(new RegExp('<' + root + '\\b'), '<pkg:' + root)
      .replace(new RegExp('</' + root + '>'), '</pkg:' + root + '>')
      .replace('xmlns=', 'xmlns:pkg=')
      .replace(new RegExp('<' + child + '\\b', 'g'), '<pkg:' + child)
      .replace(/<Default\b/g, '<pkg:Default');
    zip.file(path, xml);
    const original = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await writer.writeComments(original, [{ slideIndex: 1, severity: 'MINOR', comment: 'New feedback' }], await reader.extractDeck(original));
    expect(result.legacy).toBe(true);
    expect(result.buffer).toBe(original);
    const unchanged = await (JSZip as any).loadAsync(result.buffer);
    expect(await unchanged.file(path).async('string')).toBe(xml);
  });

  it('inserts comment links into the final slide extension list rather than an earlier empty shape list', async () => {
    const zip = await (JSZip as any).loadAsync(await buildPptx([{ title: 'A', body: [] }]));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    zip.file('ppt/slides/slide1.xml', xml.replace('</p:sp>', '<p:extLst/></p:sp>').replace('</p:sld>', '<p:extLst/></p:sld>'));
    const original = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await writer.writeComments(original, [{ slideIndex: 1, severity: 'MINOR', comment: 'New feedback' }], await reader.extractDeck(original));
    const modified = await (JSZip as any).loadAsync(result.buffer);
    const output = await modified.file('ppt/slides/slide1.xml').async('string');
    expect(output.slice(0, output.indexOf('</p:cSld>'))).not.toContain('commentRel');
    expect(output.slice(output.indexOf('</p:cSld>'))).toContain('commentRel');
  });

  it('does not duplicate content type overrides whose attributes use single quotes', async () => {
    const original = await buildPptx([{ title: 'A', body: [] }]);
    const first = await writer.writeComments(original, [{ slideIndex: 1, severity: 'MINOR', comment: 'First' }], await reader.extractDeck(original));
    const zip = await (JSZip as any).loadAsync(first.buffer);
    const types = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', types.replace(/"/g, "'"));
    const quoted = await zip.generateAsync({ type: 'nodebuffer' });
    const second = await writer.writeComments(quoted, [{ slideIndex: 1, severity: 'MINOR', comment: 'Second' }], await reader.extractDeck(quoted));
    expect(second.legacy).toBe(false);
    expect(second.commentCount).toBe(1);
    const output = await (JSZip as any).loadAsync(second.buffer);
    const result = await output.file('[Content_Types].xml').async('string');
    expect([...result.matchAll(/PartName=["']\/ppt\/authors\.xml["']/g)]).toHaveLength(1);
    expect([...result.matchAll(/PartName=["']\/ppt\/comments\/modernComment_256\.xml["']/g)]).toHaveLength(1);
  });

  it('reads nested slide notes relative to the actual slide directory and preserves the deck on write', async () => {
    const zip = await (JSZip as any).loadAsync(await buildPptx([{ title: 'Nested slide', body: [] }]));
    zip.file('ppt/slides/nested/slide1.xml', await zip.file('ppt/slides/slide1.xml').async('string'));
    zip.remove('ppt/slides/slide1.xml');
    zip.remove('ppt/slides/_rels/slide1.xml.rels');
    zip.file('ppt/slides/nested/_rels/slide1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="notes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../../notesSlides/notesSlide1.xml"/></Relationships>');
    zip.file('ppt/notesSlides/notesSlide1.xml', slideXml({ title: 'Notes', body: ['Speaker-only evidence'] }).replace(/p:sld/g, 'p:notes'));
    zip.file('ppt/_rels/presentation.xml.rels', (await zip.file('ppt/_rels/presentation.xml.rels').async('string')).replace('slides/slide1.xml', 'slides/nested/slide1.xml'));
    zip.file('[Content_Types].xml', (await zip.file('[Content_Types].xml').async('string'))
      .replace('/ppt/slides/slide1.xml', '/ppt/slides/nested/slide1.xml')
      .replace('</Types>', '<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>'));
    const original = await zip.generateAsync({ type: 'nodebuffer' });
    const deck = await reader.extractDeck(original);
    expect(deck.slides[0].speakerNotes).toBe('Speaker-only evidence');
    expect(deck.slides[0].slideFile).toBe('slides/nested/slide1.xml');
    const result = await writer.writeComments(original, [{ slideIndex: 1, severity: 'MINOR', comment: 'New feedback' }], deck);
    expect(result.legacy).toBe(true);
    expect(result.buffer).toBe(original);
  });

  it('counts only new findings, including when other slides already have bot comments', async () => {
    const original = await buildPptx([{ title: 'A', body: [] }, { title: 'B', body: [] }]);
    const first = await writer.writeComments(original, [{ slideIndex: 1, severity: 'MINOR', comment: 'First' }], await reader.extractDeck(original));
    const second = await writer.writeComments(first.buffer, [{ slideIndex: 2, severity: 'MINOR', comment: 'Second' }], await reader.extractDeck(first.buffer));
    expect(second.commentCount).toBe(1);
    const zip = await (JSZip as any).loadAsync(second.buffer);
    expect(await zip.file('ppt/comments/modernComment_256.xml').async('string')).toContain('First');
    expect(await zip.file('ppt/comments/modernComment_257.xml').async('string')).toContain('Second');
    expect(await zip.file('ppt/slides/slide2.xml').async('string')).toContain('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  });

  it('rejects oversized expanded XML and DTDs before parsing', async () => {
    const zip = await (JSZip as any).loadAsync(await buildPptx([{ title: 'A', body: [] }]));
    zip.file('ppt/slides/slide1.xml', 'x'.repeat(2 * 1024 * 1024 + 1));
    await expect(reader.extractDeck(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))).rejects.toThrow('limit');
    zip.file('ppt/slides/slide1.xml', '<!DOCTYPE x [<!ENTITY leak "secret">]><x>&leak;</x>');
    await expect(reader.extractDeck(await zip.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow('XML');
  });
});
