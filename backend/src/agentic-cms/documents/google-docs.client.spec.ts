import { generateKeyPairSync } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { GoogleDocsClient } from './google-docs.client';

// How Google's HTTP answers map to the reasons the review service acts on. fetch is stubbed:
// nothing here touches the network, and the key is a throwaway generated for the test.

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const settings: Record<string, string> = { GOOGLE_DOCS_CLIENT_EMAIL: 'bot@proj.iam.gserviceaccount.com', GOOGLE_DOCS_PRIVATE_KEY: privateKey };
const config = { get: (key: string) => settings[key] } as unknown as ConfigService;

function stubGoogle(status: number, detail: string) {
  const fetchMock = jest.fn(async (url: string) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'token', expires_in: 3600 }), text: async () => '' };
    }
    return { ok: false, status, json: async () => ({}), text: async () => detail };
  });
  jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as never);
  return fetchMock;
}

describe('GoogleDocsClient error reasons', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [401, 'Invalid credentials', 'auth'],
    [404, 'Requested entity was not found.', 'no_access'],
    [403, 'The caller does not have permission', 'forbidden'],
    [403, 'Request had insufficient authentication scopes. ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'auth'],
    [403, '{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}', 'unavailable'],
    [403, '{"error":{"status":"RATE_LIMIT_EXCEEDED"}}', 'unavailable'],
    [403, 'Quota exceeded for quota metric', 'unavailable'],
    [429, 'Too many requests', 'unavailable'],
    [500, 'Internal error', 'unavailable'],
    [400, 'Invalid requiredRevisionId: the revision is out of date', 'revision_mismatch'],
    [400, 'Invalid value at range', 'bad_request'],
  ])('maps %i "%s" to %s', async (status, detail, reason) => {
    stubGoogle(status, detail);
    await expect(new GoogleDocsClient(config).getDocument('doc')).rejects.toMatchObject({ reason, status });
  });

  it('calls a 200 whose comment is not confirmed saved uncertain, since Google applied the insert', async () => {
    const reply = { replies: [{ insertComment: { commentThread: { commentId: 'c1', plainTextQuote: 'x' } } }], commentUpdateState: 'PENDING' };
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => String(url).includes('oauth2.googleapis.com')
      ? { ok: true, status: 200, json: async () => ({ access_token: 'token', expires_in: 3600 }), text: async () => '' }
      : { ok: true, status: 200, json: async () => reply, text: async () => '' }) as never);
    await expect(new GoogleDocsClient(config).insertComment('doc', { content: 'c', startIndex: 1, endIndex: 2, tabId: null }, null))
      .rejects.toMatchObject({ reason: 'uncertain', status: 200 });
  });

  it('reports missing credentials without calling Google', async () => {
    const fetchMock = stubGoogle(200, '');
    const empty = { get: () => undefined } as unknown as ConfigService;
    await expect(new GoogleDocsClient(empty).getDocument('doc')).rejects.toMatchObject({ reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
