import { ConfigService } from '@nestjs/config';
import { MicrosoftGraphService } from './microsoft-graph.service';

const ref = { itemId: 'item', driveId: 'drive', eTag: '"opaque,7"', directDownload: false };

describe('Microsoft Graph trust boundaries', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let graph: MicrosoftGraphService;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    graph = new MicrosoftGraphService({ get: (name: string) => ({
      MSGRAPH_CLIENT_ID: 'test-client', MSGRAPH_TENANT_ID: 'test-tenant', MSGRAPH_CLIENT_SECRET: 'test-only-secret',
    })[name] } as unknown as ConfigService);
  });
  afterEach(() => { global.fetch = originalFetch; });
  const token = () => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' })));

  it.each(['http://tenant.sharepoint.com/deck.pptx', 'https://localhost/private.pptx',
    'https://tenant.sharepoint.com.attacker.test/deck.pptx', 'https://user@tenant.sharepoint.com/deck.pptx'])('rejects unsafe link %s without fetching', async (url) => {
    await expect(graph.resolveLink(url)).rejects.toThrow('HTTPS OneDrive');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves the complete opaque eTag without stripping quotes', async () => {
    token();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'item', parentReference: { driveId: 'drive' }, eTag: ref.eTag })));
    expect((await graph.resolveLink('https://tenant.sharepoint.com/deck')).eTag).toBe(ref.eTag);
  });

  it.each(['', '*', '"different"'])('rejects invalid write precondition %s without an upload', async (etag) => {
    expect((await graph.uploadPptx(ref, Buffer.from('pptx'), etag)).status).toBe(412);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the exact reviewed eTag and honors an upload precondition failure', async () => {
    token();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 412 }));
    expect(await graph.uploadPptx(ref, Buffer.from('pptx'), ref.eTag)).toEqual({ status: 412 });
    expect(fetchMock.mock.calls[1][1].headers['If-Match']).toBe(ref.eTag);
    expect(fetchMock.mock.calls[1][1].redirect).toBe('error');
  });

  it('bounds remote download size before buffering', async () => {
    token();
    fetchMock.mockResolvedValueOnce(new Response('large', { headers: { 'Content-Length': String(26 * 1024 * 1024) } }));
    await expect(graph.downloadPptx(ref)).rejects.toThrow('25 MB');
  });

  it('does not return remote Graph error bodies', async () => {
    token();
    fetchMock.mockResolvedValueOnce(new Response('sensitive remote diagnostic', { status: 500 }));
    const error = await graph.resolveLink('https://tenant.sharepoint.com/deck').catch((failure: Error) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('HTTP 500');
    expect((error as Error).message).not.toContain('sensitive');
  });
});
