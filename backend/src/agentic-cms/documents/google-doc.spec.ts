import { findQuote, flattenDocument, GoogleDocument, parseGoogleDocLink, textHash } from './google-doc';

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
