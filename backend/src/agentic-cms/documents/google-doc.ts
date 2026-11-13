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
  documentTab?: { body?: { content?: StructuralElement[] } };
  childTabs?: TabNode[];
}
interface StructuralElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: {
    elements?: { startIndex?: number; endIndex?: number; textRun?: { content?: string } }[];
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
}

/** Flattens every tab (including child tabs and table cells) into ordered paragraphs. */
export function flattenDocument(doc: GoogleDocument): DocParagraph[] {
  const tabs: { tabId: string | null; title: string | null; content: StructuralElement[] }[] = [];
  const walkTabs = (nodes: TabNode[] = []) => {
    for (const tab of nodes) {
      tabs.push({
        tabId: tab.tabProperties?.tabId ?? null,
        title: tab.tabProperties?.title ?? null,
        content: tab.documentTab?.body?.content ?? [],
      });
      walkTabs(tab.childTabs);
    }
  };
  walkTabs(doc.tabs);
  // Docs fetched without includeTabsContent put the first tab in body.
  if (!tabs.length) tabs.push({ tabId: null, title: null, content: doc.body?.content ?? [] });

  const out: DocParagraph[] = [];
  for (const tab of tabs) {
    let heading: string | null = null;
    const prefix = tabs.length > 1 && tab.title ? `${tab.title} › ` : '';
    const walk = (elements: StructuralElement[]) => {
      for (const el of elements) {
        if (el.table) {
          for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) walk(cell.content ?? []);
          continue;
        }
        if (!el.paragraph) continue; // tableOfContents is generated text; skip it.
        const parts = el.paragraph.elements ?? [];
        if (!parts.length || parts[0].startIndex === undefined) continue;
        let text = '';
        for (const part of parts) {
          const length = (part.endIndex ?? 0) - (part.startIndex ?? 0);
          const content = part.textRun?.content;
          text += content !== undefined && content.length === length ? content : '\uFFFC'.repeat(Math.max(0, length));
        }
        const style = el.paragraph.paragraphStyle?.namedStyleType ?? '';
        const clean = text.replace(/\n$/, '');
        if (/^(HEADING_\d|TITLE)$/.test(style) && clean.trim()) heading = clean.trim();
        out.push({ n: out.length + 1, tabId: tab.tabId, section: heading ? prefix + heading : prefix.replace(/ › $/, '') || null, text: clean, startIndex: parts[0].startIndex });
      }
    };
    walk(tab.content);
  }
  return out;
}

// Same-length substitutions only, so a match offset is still a document offset.
const normalize = (text: string) =>
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

/** Content hash identifying the reviewed text even when Google returns no revisionId. */
export function textHash(paragraphs: DocParagraph[]): string {
  const hash = createHash('sha256');
  for (const p of paragraphs) hash.update(`${p.tabId ?? ''}\u0000${p.text}\n`);
  return `sha256:${hash.digest('hex')}`;
}
