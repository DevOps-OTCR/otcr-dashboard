// Pure citation helpers (no imports, so tests/unit can load them directly).
type Source = { id: number; title: string; url: string };

export const CITATION_PREFIX = '#otcr-source-';

const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

/** Turns [n] into a link only when the backend returned source n, leaving code untouched. */
export function linkCitations(text: string, sources: Source[]): string {
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 === 1
      ? part
      : part.replace(/\[(\d+)\](?!\()/g, (match, id: string) =>
        (sources.some((s) => s.id === Number(id) && isWebUrl(s.url)) ? `[\\[${id}\\]](${CITATION_PREFIX}${id})` : match))))
    .join('');
}

/** Plain-text version for the Copy button: the answer plus a numbered source list. */
export function withSourceList(text: string, sources: Source[]): string {
  if (!sources.length) return text;
  return `${text}\n\nSources:\n${sources.map((s) => `[${s.id}] ${s.title} ${s.url}`).join('\n')}`;
}
