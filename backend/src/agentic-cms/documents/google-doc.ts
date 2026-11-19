import { createHash } from 'node:crypto';

// Pure helpers for Google Docs review: link parsing, flattening a documents.get
// response into paragraphs with document indices, and finding a quoted passage.
// No I/O here, so the index arithmetic is unit-tested against saved responses.

export interface DocParagraph {
  /** 1-based order across all tabs; what the model refers to. */
  n: number;
  tabId: string | null;
  /** Nearest heading above this paragraph (tab title prefixed when the doc has several tabs). */
  section: string | null;
  /** Paragraph text. Non-text elements (images, rules) are U+FFFC so offsets stay aligned. */
  text: string;
  /** Document index of text[0] (UTF-16, as the Docs API counts). */
  startIndex: number;
}

export type QuoteMatch =
  | { ok: true; tabId: string | null; startIndex: number; endIndex: number; section: string | null }
  | { ok: false; reason: 'not-found' | 'ambiguous' };

const DOC_PATH = /^\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})(?:\/|$)/;

/** Returns the document ID and optional tab for a Google Docs link, or null for anything else. */
export function parseGoogleDocLink(raw: string): { documentId: string; tabId: string | null } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return null;
  const match = DOC_PATH.exec(url.pathname);
  if (!match) return null;
  const tab = url.searchParams.get('tab');
  return { documentId: match[1], tabId: tab && /^t\.[\w.-]+$/.test(tab) ? tab : null };
}

interface TabNode {
  tabProperties?: { tabId?: string; title?: string };
  documentTab?: { body?: { content?: StructuralElement[] }; footnotes?: Record<string, { content?: StructuralElement[] }> };
  childTabs?: TabNode[];
}
interface ParagraphElement {
  startIndex?: number;
  endIndex?: number;
  textRun?: { content?: string; textStyle?: { link?: { url?: string } } };
  footnoteReference?: { footnoteId?: string; footnoteNumber?: string };
  /** Page, column and section breaks and rules hold no content, so they are not "objects not read". */
  pageBreak?: unknown;
  columnBreak?: unknown;
  horizontalRule?: unknown;
}
interface StructuralElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: {
    elements?: ParagraphElement[];
    paragraphStyle?: { namedStyleType?: string };
  };
  table?: { tableRows?: { tableCells?: { content?: StructuralElement[] }[] }[] };
  tableOfContents?: { content?: StructuralElement[] };
}
export interface GoogleDocument {
  documentId?: string;
  title?: string;
  revisionId?: string;
  tabs?: TabNode[];
  body?: { content?: StructuralElement[] };
  footnotes?: Record<string, { content?: StructuralElement[] }>;
}

export interface DocFootnote {
  /** The number shown in the document (prefixed with the tab title when the document has several tabs). */
  number: string;
  text: string;
  links: string[];
}
/** What the body text leaves out: cited sources, the contents table, and things that are not text. */
export interface DocExtras {
  /** Footnote numbers and links referenced by each body paragraph, keyed by paragraph n. */
  refs: Map<number, { footnotes: string[]; links: string[] }>;
  /** In the order the document cites them. */
  footnotes: DocFootnote[];
  /** Footnotes the document cites whose text the API response did not include. */
  unresolvedFootnotes: number;
  /** Entry lines of the generated contents table; null when the document has none. */
  tableOfContents: string[] | null;
  /** Images, drawings, equations, chips and other non-text elements. Not footnote references or breaks. */
  objectsNotRead: number;
}

const MAX_LINK_CHARS = 500;
/** Only plain web links are passed on; anything else (javascript:, data:, mailto:) is dropped. */
function webLink(raw: string | undefined): string | null {
  if (!raw || raw.length > MAX_LINK_CHARS) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? raw : null;
  } catch {
    return null;
  }
}

/** Flattens every tab (including child tabs and table cells) into ordered paragraphs. */
export function flattenDocument(doc: GoogleDocument): DocParagraph[] {
  return readDocument(doc).paragraphs;
}

/** What the body text leaves out: footnotes with their links, the contents table, and unread objects. */
export function documentExtras(doc: GoogleDocument): DocExtras {
  return readDocument(doc).extras;
}

/** Text of one paragraph element list, with U+FFFC for non-text elements so document offsets stay aligned. */
function paragraphText(parts: ParagraphElement[]): { text: string; objects: number; links: string[] } {
  let text = '';
  let objects = 0;
  const links: string[] = [];
  for (const part of parts) {
    const length = (part.endIndex ?? 0) - (part.startIndex ?? 0);
    const content = part.textRun?.content;
    if (content !== undefined && content.length === length) {
      text += content;
      const link = webLink(part.textRun?.textStyle?.link?.url);
      if (link && !links.includes(link)) links.push(link);
      continue;
    }
    text += '\uFFFC'.repeat(Math.max(0, length));
    if (!part.footnoteReference && !part.pageBreak && !part.columnBreak && !part.horizontalRule) objects++;
  }
  return { text, objects, links };
}

function readDocument(doc: GoogleDocument): { paragraphs: DocParagraph[]; extras: DocExtras } {
  type Tab = { tabId: string | null; title: string | null; content: StructuralElement[]; footnotes: Record<string, { content?: StructuralElement[] }> };
  const tabs: Tab[] = [];
  const walkTabs = (nodes: TabNode[] = []) => {
    for (const tab of nodes) {
      tabs.push({
        tabId: tab.tabProperties?.tabId ?? null,
        title: tab.tabProperties?.title ?? null,
        content: tab.documentTab?.body?.content ?? [],
        footnotes: tab.documentTab?.footnotes ?? {},
      });
      walkTabs(tab.childTabs);
    }
  };
  walkTabs(doc.tabs);
  // Docs fetched without includeTabsContent put the first tab in body.
  if (!tabs.length) tabs.push({ tabId: null, title: null, content: doc.body?.content ?? [], footnotes: doc.footnotes ?? {} });

  const out: DocParagraph[] = [];
  const extras: DocExtras = { refs: new Map(), footnotes: [], unresolvedFootnotes: 0, tableOfContents: null, objectsNotRead: 0 };
  const cited = new Set<string>();

  /** Plain text of a footnote or contents-table body: paragraphs joined by newlines, tables flattened. */
  const plainLines = (elements: StructuralElement[], links: string[]): string[] => {
    const lines: string[] = [];
    for (const el of elements) {
      if (el.table) {
        for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) lines.push(...plainLines(cell.content ?? [], links));
        continue;
      }
      if (!el.paragraph) continue;
      const { text, objects, links: found } = paragraphText(el.paragraph.elements ?? []);
      extras.objectsNotRead += objects;
      for (const link of found) if (!links.includes(link)) links.push(link);
      lines.push(text.replace(/\n$/, ''));
    }
    return lines;
  };

  for (const tab of tabs) {
    let heading: string | null = null;
    const prefix = tabs.length > 1 && tab.title ? `${tab.title} › ` : '';
    const walk = (elements: StructuralElement[]) => {
      for (const el of elements) {
        if (el.table) {
          for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) walk(cell.content ?? []);
          continue;
        }
        if (el.tableOfContents) {
          const entries = plainLines(el.tableOfContents.content ?? [], []).map((line) => line.trim()).filter(Boolean);
          extras.tableOfContents = [...(extras.tableOfContents ?? []), ...entries];
          continue;
        }
        if (!el.paragraph) continue;
        const parts = el.paragraph.elements ?? [];
        if (!parts.length || parts[0].startIndex === undefined) continue;
        const { text, objects, links } = paragraphText(parts);
        extras.objectsNotRead += objects;
        const style = el.paragraph.paragraphStyle?.namedStyleType ?? '';
        const clean = text.replace(/\n$/, '');
        if (/^(HEADING_\d|TITLE)$/.test(style) && clean.trim()) heading = clean.trim();
        const n = out.length + 1;
        out.push({ n, tabId: tab.tabId, section: heading ? prefix + heading : prefix.replace(/ › $/, '') || null, text: clean, startIndex: parts[0].startIndex });

        const numbers: string[] = [];
        for (const part of parts) {
          const ref = part.footnoteReference;
          if (!ref) continue;
          const key = `${tab.tabId ?? ''}\u0000${ref.footnoteId ?? ''}`;
          const note = ref.footnoteId ? tab.footnotes[ref.footnoteId] : undefined;
          const number = prefix + (ref.footnoteNumber ?? String(extras.footnotes.length + 1));
          numbers.push(number);
          if (cited.has(key)) continue;
          cited.add(key);
          if (!note) { extras.unresolvedFootnotes++; continue; }
          const noteLinks: string[] = [];
          const noteText = plainLines(note.content ?? [], noteLinks).join('\n').trim();
          extras.footnotes.push({ number, text: noteText, links: noteLinks });
        }
        if (numbers.length || links.length) extras.refs.set(n, { footnotes: numbers, links });
      }
    };
    walk(tab.content);
  }
  return { paragraphs: out, extras };
}

// Same-length substitutions only, so a match offset is still a document offset.
export const normalize = (text: string) =>
  text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u00A0/g, ' ');

/** Finds a quote that occurs exactly once, inside a single paragraph. */
export function findQuote(paragraphs: DocParagraph[], quote: string): QuoteMatch {
  const needle = normalize(quote.trim());
  if (!needle) return { ok: false, reason: 'not-found' };
  let found: Extract<QuoteMatch, { ok: true }> | null = null;
  for (const p of paragraphs) {
    const hay = normalize(p.text);
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
      if (found) return { ok: false, reason: 'ambiguous' };
      found = { ok: true, tabId: p.tabId, startIndex: p.startIndex + at, endIndex: p.startIndex + at + needle.length, section: p.section };
    }
  }
  return found ?? { ok: false, reason: 'not-found' };
}

/**
 * Content hash identifying the reviewed text even when Google returns no revisionId. Footnotes and
 * the contents table are part of what was reviewed, so they are included when the document has them.
 * A document with neither hashes exactly as it did before they were read.
 */
export function textHash(paragraphs: DocParagraph[], extras?: Pick<DocExtras, 'footnotes' | 'tableOfContents'>): string {
  const hash = createHash('sha256');
  for (const p of paragraphs) hash.update(`${p.tabId ?? ''}\u0000${p.text}\n`);
  for (const note of extras?.footnotes ?? []) hash.update(`footnote\u0000${note.number}\u0000${note.text}\u0000${note.links.join('\u0001')}\n`);
  if (extras?.tableOfContents) hash.update(`contents\u0000${extras.tableOfContents.join('\n')}\n`);
  return `sha256:${hash.digest('hex')}`;
}
