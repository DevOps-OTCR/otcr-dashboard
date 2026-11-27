import { publicResearchUrl, TavilyExtractClient } from './tavily-extract.client';

const config = (key?: string) => ({ get: () => key }) as never;
describe('Tavily extracted source content', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each(['http://localhost/x', 'http://127.0.0.1/x', 'http://169.254.169.254/latest', 'http://[::1]/x', 'file:///tmp/a', 'https://user:password@example.org/x', 'https://example.org:8443/x', 'https://foo.internal/x'])('excludes non-public URL %s', url => {
    expect(publicResearchUrl(url)).toBe(false);
  });
  it('requires a key and makes no outbound call for unsupported URLs', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(new TavilyExtractClient(config()).extract(['https://example.org'], new AbortController().signal)).rejects.toMatchObject({ reason: 'not_configured' });
    expect(await new TavilyExtractClient(config('test')).extract(['http://localhost/x'], new AbortController().signal)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses the fixed provider endpoint, bounds extracted text and ignores unsolicited result URLs', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ results: [
      { url: 'https://example.org/study', raw_content: 'a'.repeat(6000) }, { url: 'https://other.org', raw_content: 'Unsolicited' },
    ], failed_results: [{ url: 'https://example.org/unread' }] })));
    const result = await new TavilyExtractClient(config('test-key')).extract(['https://example.org/study', 'https://example.org/unread'], new AbortController().signal);
    expect(result).toHaveLength(1); expect(result[0].text).toHaveLength(5000);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.tavily.com/extract');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ extract_depth: 'basic', format: 'text' });
  });
  it('rejects excessive provider responses rather than storing them', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('x'.repeat(1_000_001)));
    await expect(new TavilyExtractClient(config('test-key')).extract(['https://example.org/study'], new AbortController().signal)).rejects.toMatchObject({ reason: 'bad_response' });
  });
});
