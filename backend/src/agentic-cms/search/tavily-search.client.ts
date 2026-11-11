import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SearchResult {
  title: string;
  url: string;
  excerpt: string;
  publishedDate?: string;
}

export type SearchErrorReason = 'not_configured' | 'auth' | 'limit' | 'rate_limited' | 'timeout' | 'unavailable' | 'bad_response';

export class SearchError extends Error {
  constructor(readonly reason: SearchErrorReason) {
    super(`Web search failed: ${reason}`);
  }
}

const TAVILY_URL = 'https://api.tavily.com/search';
const TIMEOUT_MS = 20_000;
const MAX_EXCERPT_CHARS = 700;

/**
 * Web search through Tavily (https://docs.tavily.com). The key is read from
 * TAVILY_API_KEY on each call and stays on the backend. One basic search costs
 * one Tavily credit. Callers must check the release flag before searching.
 */
@Injectable()
export class TavilySearchClient {
  private readonly log = new Logger('OtcrBotSearch');

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async search(query: string, maxResults: number, signal: AbortSignal): Promise<SearchResult[]> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new SearchError('not_configured');
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(TAVILY_URL, {
        method: 'POST',
        signal: AbortSignal.any([signal, timeout]),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, max_results: maxResults, search_depth: 'basic', include_answer: false }),
      });
    } catch (e) {
      if (signal.aborted) throw e;
      return this.fail(timeout.aborted ? 'timeout' : 'unavailable', 'network');
    }
    if (!res.ok) {
      const reason: SearchErrorReason =
        res.status === 401 || res.status === 403 ? 'auth'
          : res.status === 432 || res.status === 433 ? 'limit'
            : res.status === 429 ? 'rate_limited'
              : 'unavailable';
      return this.fail(reason, `HTTP ${res.status}`);
    }
    const body = (await res.json().catch(() => undefined)) as
      | { results?: { title?: unknown; url?: unknown; content?: unknown; published_date?: unknown }[] }
      | undefined;
    if (!Array.isArray(body?.results)) return this.fail('bad_response', 'missing results');
    return body.results.flatMap((r) => {
      if (typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url)) return [];
      const content = typeof r.content === 'string' ? r.content.replace(/\s+/g, ' ').trim() : '';
      return [{
        title: (typeof r.title === 'string' && r.title.trim()) || r.url,
        url: r.url,
        excerpt: content.length > MAX_EXCERPT_CHARS ? `${content.slice(0, MAX_EXCERPT_CHARS)}…` : content,
        ...(typeof r.published_date === 'string' && r.published_date ? { publishedDate: r.published_date } : {}),
      }];
    });
  }

  private apiKey(): string | undefined {
    return this.config.get<string>('TAVILY_API_KEY')?.trim() || undefined;
  }

  private fail(reason: SearchErrorReason, detail: string): never {
    // Never log the key or the user's query.
    this.log.warn(`Web search failed: ${reason} (${detail})`);
    throw new SearchError(reason);
  }
}
