import { Logger } from '@nestjs/common';
import { SearchError, TavilySearchClient } from './tavily-search.client';

const KEY = 'tvly-secret-key';
const client = (settings: Record<string, string> = { TAVILY_API_KEY: KEY }) =>
  new TavilySearchClient({ get: (k: string) => settings[k] } as never);
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const signal = () => new AbortController().signal;

describe('TavilySearchClient', () => {
  let fetchMock: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('is unavailable and makes no request without TAVILY_API_KEY', async () => {
    const c = client({});
    expect(c.isConfigured()).toBe(false);
    await expect(c.search('q', 5, signal())).rejects.toMatchObject({ reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a basic search with a bearer key and returns cleaned results', async () => {
    fetchMock.mockResolvedValue(reply(200, { results: [
      { title: 'Report', url: 'https://example.com/a', content: 'Line one.\n\n  Line two.', published_date: '2026-10-01' },
      { title: '', url: 'https://example.com/b', content: 'x'.repeat(2000) },
      { title: 'Script', url: 'javascript:alert(1)', content: 'bad' },
      { title: 'No URL' },
    ] }));
    const results = await client().search('campus e-bikes', 3, signal());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.tavily.com/search');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body)).toEqual({ query: 'campus e-bikes', max_results: 3, search_depth: 'basic', include_answer: false });
    expect(results).toEqual([
      { title: 'Report', url: 'https://example.com/a', excerpt: 'Line one. Line two.', publishedDate: '2026-10-01' },
      { title: 'https://example.com/b', url: 'https://example.com/b', excerpt: `${'x'.repeat(700)}…` },
    ]);
  });

  it.each([
    [401, 'auth'],
    [432, 'limit'],
    [433, 'limit'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
  ])('maps HTTP %i to %s without logging the key or query', async (status, reason) => {
    fetchMock.mockResolvedValue(reply(status, { detail: { error: 'x' } }));
    await expect(client().search('confidential client query', 5, signal())).rejects.toMatchObject({ reason });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain('confidential');
  });

  it('maps network failures and unreadable bodies', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client().search('q', 5, signal())).rejects.toMatchObject({ reason: 'unavailable' });
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    await expect(client().search('q', 5, signal())).rejects.toBeInstanceOf(SearchError);
  });

  it('rethrows when the user cancels instead of reporting a search failure', async () => {
    const abort = new AbortController();
    fetchMock.mockImplementation(async () => { abort.abort(); throw new DOMException('aborted', 'AbortError'); });
    await expect(client().search('q', 5, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
