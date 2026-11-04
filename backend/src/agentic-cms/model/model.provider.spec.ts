import { createModelClient } from './model.provider';

const quietLog = { warn: jest.fn(), log: jest.fn() } as never;
const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as never;

describe('createModelClient', () => {
  it('uses the fake model when LUMEN_API_KEY is blank, so CI needs no credentials', () => {
    expect(createModelClient(config({}), quietLog).name).toBe('fake');
    expect(createModelClient(config({ LUMEN_API_KEY: '   ' }), quietLog).name).toBe('fake');
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