import { assistantMessage } from './model-client';

describe('assistantMessage', () => {
  it('builds a plain text reply with no tool_calls key', () => {
    const m = assistantMessage('hello', []);
    expect(m).toEqual({ role: 'assistant', content: 'hello' });
    expect('tool_calls' in m).toBe(false);
  });

  it('uses null content when the model only asked for tools', () => {
    const m = assistantMessage('', [{ id: 'c1', name: 'web_search', args: { query: 'x' } }]);
    expect(m).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'web_search', arguments: '{"query":"x"}' } }],
    });
  });

  it('keeps text alongside tool calls and stringifies missing args as {}', () => {
    const m = assistantMessage('Let me check.', [{ id: 'c2', name: 'load_skill', args: undefined }]);
    expect(m).toMatchObject({
      content: 'Let me check.',
      tool_calls: [{ id: 'c2', function: { name: 'load_skill', arguments: '{}' } }],
    });
  });
});