'use client';

import { Check, Copy } from 'lucide-react';
import { useMemo, useRef, useState, type RefObject } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentSource } from './chat-stream';
import { CITATION_PREFIX, linkCitations, withSourceList } from './citations';

const EXTERNAL_LINK = { target: '_blank', rel: 'noopener noreferrer nofollow' } as const;

function components(sources: AgentSource[]): Components {
  return {
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
    h1: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold first:mt-0">{children}</h3>,
    h2: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold first:mt-0">{children}</h3>,
    h3: ({ children }) => <h4 className="mb-1 mt-3 font-semibold first:mt-0">{children}</h4>,
    h4: ({ children }) => <h4 className="mb-1 mt-3 font-semibold first:mt-0">{children}</h4>,
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
    blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-slate-300 pl-3 text-slate-600 dark:border-slate-600 dark:text-slate-300">{children}</blockquote>,
    hr: () => <hr className="my-3 border-slate-200 dark:border-slate-700" />,
    pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-800">{children}</pre>,
    code: ({ children }) => <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] dark:bg-slate-800">{children}</code>,
    table: ({ children }) => <div className="my-2 overflow-x-auto"><table className="w-full border-collapse text-xs">{children}</table></div>,
    th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold dark:border-slate-700 dark:bg-slate-800">{children}</th>,
    td: ({ children }) => <td className="border border-slate-200 px-2 py-1 align-top dark:border-slate-700">{children}</td>,
    a: ({ href, children }) => {
      const source = href?.startsWith(CITATION_PREFIX)
        ? sources.find((s) => s.id === Number(href.slice(CITATION_PREFIX.length)))
        : undefined;
      if (source) {
        return (
          <a {...EXTERNAL_LINK} href={source.url} title={source.title}
            className="mx-0.5 align-super text-[0.7em] font-semibold text-blue-600 hover:underline dark:text-blue-400">
            [{source.id}]
          </a>
        );
      }
      return <a {...EXTERNAL_LINK} href={href} className="text-blue-600 underline dark:text-blue-400">{children}</a>;
    },
  };
}

/** HTML keeps headings, lists and links when pasted into Google Docs or Slides. */
function replyHtml(body: HTMLElement, sources: AgentSource[]) {
  const copy = body.cloneNode(true) as HTMLElement;
  if (sources.length) {
    const heading = document.createElement('p');
    heading.textContent = 'Sources:';
    copy.append(heading);
  }
  for (const source of sources) {
    const line = document.createElement('p');
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = `[${source.id}] ${source.title}`;
    line.append(link);
    copy.append(line);
  }
  return copy.innerHTML;
}

function CopyButton({ bodyRef, text, sources }: { bodyRef: RefObject<HTMLDivElement | null>; text: string; sources: AgentSource[] }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    const plain = withSourceList(text, sources);
    try {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([replyHtml(bodyRef.current!, sources)], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        })]);
      } catch {
        await navigator.clipboard.writeText(plain); // browsers without rich clipboard support
      }
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    setTimeout(() => setStatus('idle'), 1500);
  };

  return (
    <button type="button" onClick={() => void copy()} className="mt-1 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
      {status === 'copied' ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {status === 'copied' ? 'Copied' : status === 'failed' ? "Couldn't copy" : 'Copy'}
    </button>
  );
}

/**
 * Model text rendered as Markdown, with [n] citations linked to the backend's sources.
 * Replies can repeat untrusted web text, so raw HTML stays off and images are dropped:
 * an image would make the browser call an outside URL without a click.
 */
export function MessageText({ text, sources, copyable = false }: { text: string; sources: AgentSource[]; copyable?: boolean }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const markdown = useMemo(() => linkCitations(text, sources), [text, sources]);
  const renderers = useMemo(() => components(sources), [sources]);
  return (
    <div>
      <div ref={bodyRef} className="break-words leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers} disallowedElements={['img']}>
          {markdown}
        </ReactMarkdown>
      </div>
      {copyable && <CopyButton bodyRef={bodyRef} text={text} sources={sources} />}
    </div>
  );
}
