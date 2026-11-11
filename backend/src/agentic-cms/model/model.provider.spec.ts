import { createModelClient } from './model.provider';

const quietLog = { warn: jest.fn(), log: jest.fn() } as never;
const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as never;

describe('createModelClient', () => {
  it('fails clearly instead of answering with a fake model when LUMEN_API_KEY is blank', async () => {
    for (const values of [{}, { LUMEN_API_KEY: '   ' }]) {
      const client = createModelClient(config(values), quietLog);
      expect(client.name).toBe('not-configured');
      await expect(client.stream({} as never, () => undefined)).rejects.toMatchObject({ kind: 'config', retryable: false });
    }
  });

  it('uses Lumen through the OpenAI-compatible client when a key is set', () => {
    const client = createModelClient(config({ LUMEN_API_KEY: 'sk-test', LUMEN_MODEL: 'deepseek-v4.1-flash' }), quietLog);
    expect(client.name).toBe('openai-compatible');
  });

  it('never logs the key', () => {
    const log = { warn: jest.fn(), log: jest.fn() };
    createModelClient(config({ LUMEN_API_KEY: 'sk-secret-123' }), log as never);
    expect(JSON.stringify([log.log.mock.calls, log.warn.mock.calls])).not.toContain('sk-secret-123');
  });
});