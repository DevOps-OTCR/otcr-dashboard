'use client';

import { Fragment, type ReactNode } from 'react';
import type { AgentSource } from './chat-stream';

/** Renders **bold** inside a line of model text. Everything is rendered as text, never as HTML. */
function withBold(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={`${keyPrefix}-b${i}`}>{part.slice(2, -2)}</strong>
      : <Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>);
}

/** Model text with [n] citations linked to the sources the backend returned. */
export function MessageText({ text, sources }: { text: string; sources: AgentSource[] }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed">
      {parts.map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        const source = match ? sources.find((s) => s.id === Number(match[1])) : undefined;
        if (!source) return <Fragment key={i}>{withBold(part, String(i))}</Fragment>;
        return (
          <a
            key={i}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={source.title}
            className="mx-0.5 align-super text-[0.7em] font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            [{source.id}]
          </a>
        );
      })}
    </div>
  );
}
