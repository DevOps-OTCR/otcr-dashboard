import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import { SearchError } from './tavily-search.client';

export function publicResearchUrl(value: string): boolean {
  try {
    const u = new URL(value); const host = u.hostname.toLowerCase();
    return value.length <= 2048 && ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password
      && !u.port && host.includes('.') && !isIP(host.replace(/^\[|\]$/g, ''))
      && !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host);
  } catch { return false; }
}

/** Only calls the fixed provider endpoint; never fetches arbitrary URLs locally. */
@Injectable()
export class TavilyExtractClient {
  constructor(private readonly config: ConfigService) {}
  async extract(urls: string[], signal: AbortSignal): Promise<{ url: string; text: string }[]> {
    const key = this.config.get<string>('TAVILY_API_KEY')?.trim();
    if (!key) throw new SearchError('not_configured');
    const allowed = [...new Set(urls.filter(publicResearchUrl))].slice(0, 12);
    if (!allowed.length) return [];
    try {
      const res = await fetch('https://api.tavily.com/extract', {
        method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), redirect: 'error',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: allowed, extract_depth: 'basic', format: 'text', include_images: false }),
      });
      if (!res.ok || !res.body) throw new SearchError('unavailable');
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let size = 0; let text = '';
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 1_000_000) { await reader.cancel(); throw new SearchError('bad_response'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
      } finally { reader.releaseLock(); }
      const body = JSON.parse(text + decoder.decode()) as { results?: { url?: unknown; raw_content?: unknown }[] };
      if (!Array.isArray(body.results)) throw new SearchError('bad_response');
      return body.results.flatMap(r => typeof r.url === 'string' && allowed.includes(r.url) && typeof r.raw_content === 'string' && r.raw_content.trim()
        ? [{ url: r.url, text: r.raw_content.slice(0, 5000) }] : []);
    } catch (error) {
      if (signal.aborted) throw error;
      throw error instanceof SearchError ? error : new SearchError('unavailable');
    }
  }
}
