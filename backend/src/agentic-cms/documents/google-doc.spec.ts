import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { documentExtras, findQuote, flattenDocument, GoogleDocument, parseGoogleDocLink, textHash } from './google-doc';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

// Builds a paragraph element the way documents.get returns one: each run carries its own indices.
function para(start: number, runs: (string | { object: number })[], style = 'NORMAL_TEXT') {
  let at = start;
  const elements = runs.map(run => {
    const length = typeof run === 'string' ? run.length : run.object;
    const element = typeof run === 'string'
      ? { startIndex: at, endIndex: at + length, textRun: { content: run } }
      : { startIndex: at, endIndex: at + length, inlineObjectElement: {} };
    at += length;
    return element;
  });
  return { startIndex: start, endIndex: at, paragraph: { elements, paragraphStyle: { namedStyleType: style } } };
}

// Paragraph elements as documents.get returns them, written out so each index is visible.
const run = (startIndex: number, content: string, url?: string) =>
  ({ startIndex, endIndex: startIndex + content.length, textRun: { content, ...(url ? { textStyle: { link: { url } } } : {}) } });
const paragraphOf = (startIndex: number, elements: object[], style = 'NORMAL_TEXT') =>
  ({ startIndex, endIndex: (elements[elements.length - 1] as { endIndex: number }).endIndex, paragraph: { elements, paragraphStyle: { namedStyleType: style } } });

describe('footnotes, contents and objects the body text leaves out', () => {
  const cited = 'Revenue grew 12%'; // 16 characters, then the footnote reference at index 56
  const footnoteText = ' Source: ';
  const build = (footnoteBody = 'Acme Annual Report 2025', withExtras = true): GoogleDocument => ({
    tabs: [{ tabProperties: { tabId: 't.0', title: 'Main' }, documentTab: {
      body: { content: [
        ...(withExtras ? [{ startIndex: 1, endIndex: 20, tableOfContents: { content: [
          paragraphOf(1, [run(1, 'Findings\n')]), paragraphOf(10, [run(10, 'Sources\n')]),
        ] } }] : []),
        paragraphOf(20, [run(20, 'Findings\n')], 'HEADING_1'),
        paragraphOf(40, [
          run(40, cited),
          { startIndex: 56, endIndex: 57, footnoteReference: { footnoteId: 'kix.fn1', footnoteNumber: '1' } },
          run(57, ' last year.\n'),
        ]),
        paragraphOf(80, [
          run(80, 'See the '), run(88, 'report', 'https://acme.example/report'), { startIndex: 94, endIndex: 95, inlineObjectElement: {} },
          run(95, ' now '), run(100, 'bad', 'javascript:alert(1)'), run(103, '\n'),
        ]),
      ] },
      footnotes: withExtras ? { 'kix.fn1': { content: [paragraphOf(0, [
        run(0, footnoteText), run(9, footnoteBody, 'https://acme.example/ar'), run(9 + footnoteBody.length, '\n'),
      ])] } } : {},
    } }],
  });

  it('keeps the body text and its offsets exactly as they were', () => {
    const paragraphs = flattenDocument(build());
    expect(paragraphs.map((p) => p.text)).toEqual(['Findings', `${cited}\uFFFC last year.`, 'See the report\uFFFC now bad']);
    expect(findQuote(paragraphs, 'Revenue grew 12%')).toMatchObject({ ok: true, startIndex: 40, endIndex: 56 });
    // Same offsets as a document with no footnote, contents table or hash extras at all.
    expect(flattenDocument(build('x', false)).map((p) => [p.startIndex, p.text])).toEqual(paragraphs.map((p) => [p.startIndex, p.text]));
  });

  it('returns the footnote a statistic cites, with its text and link, and which paragraph cites it', () => {
    const doc = build();
    const extras = documentExtras(doc);
    const paragraph = flattenDocument(doc).find((p) => p.text.startsWith(cited))!;
    expect(extras.footnotes).toEqual([{ number: '1', text: 'Source: Acme Annual Report 2025', links: ['https://acme.example/ar'] }]);
    expect(extras.refs.get(paragraph.n)).toEqual({ footnotes: ['1'], links: [] });
    expect(extras.unresolvedFootnotes).toBe(0);
  });

  it('returns the contents table entries, and null when there is none', () => {
    expect(documentExtras(build()).tableOfContents).toEqual(['Findings', 'Sources']);
    expect(documentExtras(build('x', false)).tableOfContents).toBeNull();
  });

  it('counts a picture as an object not read, but not a footnote reference', () => {
    expect(documentExtras(build()).objectsNotRead).toBe(1);
  });

  it('passes on web links only', () => {
    const doc = build();
    const paragraph = flattenDocument(doc).find((p) => p.text.startsWith('See the'))!;
    expect(documentExtras(doc).refs.get(paragraph.n)?.links).toEqual(['https://acme.example/report']);
  });

  it('reports a cited footnote whose text is missing, instead of dropping it silently', () => {
    const doc = build();
    delete doc.tabs![0].documentTab!.footnotes;
    const extras = documentExtras(doc);
    expect(extras.footnotes).toEqual([]);
    expect(extras.unresolvedFootnotes).toBe(1);
  });

  it('changes the hash when only a footnote changes, and not for a document without footnotes or contents', () => {
    const before = build();
    const after = build('Acme Annual Report 2024');
    const hash = (doc: GoogleDocument) => textHash(flattenDocument(doc), documentExtras(doc));
    expect(hash(before)).not.toBe(hash(after));
    expect(flattenDocument(before)).toEqual(flattenDocument(after)); // the body is identical
    const plain = build('x', false);
    expect(hash(plain)).toBe(textHash(flattenDocument(plain)));
  });
});

describe('parseGoogleDocLink', () => {
  it.each([
    [`https://docs.google.com/document/d/${ID}/edit`, null],
    [`https://docs.google.com/document/d/${ID}/edit?usp=sharing`, null],
    [`https://docs.google.com/document/u/1/d/${ID}/view`, null],
    [`https://docs.google.com/document/d/${ID}`, null],
    [`https://docs.google.com/document/d/${ID}/edit?tab=t.abc123`, 't.abc123'],
  ])('accepts %s', (url, tabId) => {
    expect(parseGoogleDocLink(url)).toEqual({ documentId: ID, tabId });
  });

  it.each([
    `https://docs.google.com/spreadsheets/d/${ID}/edit`,
    `https://docs.google.com/presentation/d/${ID}/edit`,
    `https://drive.google.com/file/d/${ID}/view`,
    `http://docs.google.com/document/d/${ID}/edit`,
    `https://docs.google.com.evil.example/document/d/${ID}/edit`,
    'https://contoso.sharepoint.com/:p:/r/deck.pptx',
    'not a url',
  ])('rejects %s', url => {
    expect(parseGoogleDocLink(url)).toBeNull();
  });
});

describe('flattenDocument and findQuote', () => {
  const doc: GoogleDocument = {
    tabs: [
      { tabProperties: { tabId: 't.0', title: 'Main' }, documentTab: { body: { content: [
        { endIndex: 1, sectionBreak: {} } as never,
        para(1, ['Market sizing\n'], 'HEADING_1'),
        para(15, ['The market is ', { object: 1 }, ' growing fast.\n']),
        { startIndex: 45, endIndex: 80, table: { tableRows: [{ tableCells: [{ content: [para(48, ['Repeated cell\n'])] }] }] } },
        para(80, ['Repeated cell\n']),
      ] } } },
      { tabProperties: { tabId: 't.1', title: 'Appendix' }, documentTab: { body: { content: [
        para(1, ['Sources \u201Cquoted\u201D here\n']),
      ] } } },
    ],
  };
  const paragraphs = flattenDocument(doc);

  it('keeps document indices aligned across non-text elements', () => {
    const match = findQuote(paragraphs, 'growing fast');
    // "The market is " (14) + object (1) + " " (1) from paragraph start 15 → 31.
    expect(match).toEqual({ ok: true, tabId: 't.0', startIndex: 31, endIndex: 43, section: 'Main › Market sizing' });
  });

  it('reads table cells and every tab, and labels sections by tab', () => {
    expect(paragraphs.map(p => [p.tabId, p.section, p.text])).toEqual([
      ['t.0', 'Main › Market sizing', 'Market sizing'],
      ['t.0', 'Main › Market sizing', 'The market is \uFFFC growing fast.'],
      ['t.0', 'Main › Market sizing', 'Repeated cell'],
      ['t.0', 'Main › Market sizing', 'Repeated cell'],
      ['t.1', 'Appendix', 'Sources \u201Cquoted\u201D here'],
    ]);
  });

  it('refuses quotes that repeat or are missing', () => {
    expect(findQuote(paragraphs, 'Repeated cell')).toEqual({ ok: false, reason: 'ambiguous' });
    expect(findQuote(paragraphs, 'shrinking')).toEqual({ ok: false, reason: 'not-found' });
    expect(findQuote(paragraphs, 'sizing The market')).toEqual({ ok: false, reason: 'not-found' }); // spans paragraphs
  });

  it('matches straight quotes against curly ones without shifting indices', () => {
    expect(findQuote(paragraphs, '"quoted"')).toMatchObject({ ok: true, tabId: 't.1', startIndex: 9, endIndex: 17 });
  });

  it('hash changes when text changes', () => {
    const edited = flattenDocument({ ...doc, tabs: [doc.tabs[0]] });
    expect(textHash(paragraphs)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(textHash(edited)).not.toEqual(textHash(paragraphs));
  });
});

// A real documents.get response (includeTabsContent=true) saved by the spike, so the index
// arithmetic is checked against what Google actually returns, not only hand-built documents.
describe('real Google response (fixture)', () => {
  const doc = JSON.parse(readFileSync(join(__dirname, '__fixtures__/review-doc.json'), 'utf8')) as GoogleDocument;
  type RawTab = { tabProperties?: { tabId?: string }; documentTab?: { body?: { content?: RawElement[] } }; childTabs?: RawTab[] };
  type RawElement = { table?: { tableRows?: { tableCells?: { content?: RawElement[] }[] }[] }; paragraph?: { elements?: { startIndex?: number; textRun?: { content?: string } }[] } };
  const tabsOf = (nodes: RawTab[] = []): RawTab[] => nodes.flatMap(tab => [tab, ...tabsOf(tab.childTabs)]);
  const allTabs = tabsOf(doc.tabs as RawTab[]);
  const runsIn = (elements: RawElement[] = []): { startIndex: number; content: string }[] =>
    elements.flatMap(el => el.table
      ? (el.table.tableRows ?? []).flatMap(row => (row.tableCells ?? []).flatMap(cell => runsIn(cell.content)))
      : (el.paragraph?.elements ?? []).flatMap(part => (part.textRun?.content !== undefined ? [{ startIndex: part.startIndex ?? 0, content: part.textRun.content }] : [])));

  it('anchors the quote the live spike confirmed, at the offsets Google accepted', () => {
    expect(findQuote(flattenDocument(doc), 'hosting arrangements are supported'))
      .toMatchObject({ ok: true, tabId: 't.0', startIndex: 380, endIndex: 414 });
  });

  it('puts every quoted substring at the index Google reports for its text run', () => {
    const paragraphs = flattenDocument(doc);
    let checked = 0;
    for (const tab of allTabs) {
      for (const run of runsIn(tab.documentTab?.body?.content)) {
        if (run.content.length < 12) continue;
        const quote = run.content.slice(3, 12);
        const trimmed = quote.trim();
        if (!trimmed) continue;
        const match = findQuote(paragraphs, quote);
        if ('reason' in match) continue; // ambiguous: the same words occur elsewhere
        // findQuote trims the quote, so the anchor starts after any leading spaces.
        const start = run.startIndex + 3 + (quote.length - quote.trimStart().length);
        expect(match.startIndex).toBe(start);
        expect(match.endIndex).toBe(start + trimmed.length);
        expect(match.tabId).toBe(tab.tabProperties?.tabId ?? null);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  it('keeps every tab, each paragraph carrying its own tab id', () => {
    const paragraphs = flattenDocument(doc);
    expect(allTabs.length).toBeGreaterThan(0);
    for (const tab of allTabs) {
      expect(paragraphs.some(p => p.tabId === (tab.tabProperties?.tabId ?? null))).toBe(true);
    }
  });

  it('hashes the reviewed text to the value the spike recorded', () => {
    expect(textHash(flattenDocument(doc)).startsWith('sha256:49d31627')).toBe(true);
  });
});
