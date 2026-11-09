import { z } from 'zod';
import type { AgentEvent } from '../agent/agent.events';
import { ToolRegistry } from './tool-registry';
import { AgentTool, ToolContext, ToolFailure } from './tool.types';

const echoInput = z.object({ text: z.string().min(1) });
const tool = (over: Partial<AgentTool<typeof echoInput>> = {}): AgentTool<typeof echoInput> => ({
  name: 'echo',
  description: 'Echo text',
  input: echoInput,
  label: ({ text }) => `Echoing ${text}`,
  run: async ({ text }) => ({ content: `echo: ${text}`, note: 'done' }),
  ...over,
});
// The constructor only collects tools; build one around arbitrary test tools.
const registryWith = (...tools: AgentTool[]) => {
  const registry = new ToolRegistry({} as never, {} as never, {} as never);
  (registry as unknown as { tools: AgentTool[] }).tools = tools;
  return registry;
};
const ctx = (signal = new AbortController().signal): ToolContext => ({
  user: { id: 'u', email: 'u@x.test', role: 'CONSULTANT' }, projectId: 'p1', signal, addSources: async () => [],
});

async function exec(registry: ToolRegistry, name: string, args: unknown, c = ctx()) {
  const events: AgentEvent[] = [];
  const content = await registry.execute({ id: 'c1', name, args }, await registry.available(), c, (e) => events.push(e));
  return { content, events };
}

describe('ToolRegistry', () => {
  it('lists only available tools and builds JSON schemas from their zod input', async () => {
    const registry = registryWith(tool(), tool({ name: 'hidden', isAvailable: () => false }));
    const available = await registry.available();
    expect(available.map((t) => t.name)).toEqual(['echo']);
    expect(registry.schemas(available)).toEqual([{
      name: 'echo',
      description: 'Echo text',
      parameters: { type: 'object', properties: { text: { type: 'string', minLength: 1 } }, required: ['text'], additionalProperties: false },
    }]);
  });

  it('runs a valid call and streams start/end events with the label and note', async () => {
    const { content, events } = await exec(registryWith(tool()), 'echo', { text: 'hi' });
    expect(content).toBe('echo: hi');
    expect(events).toEqual([
      { type: 'tool_start', id: 'c1', name: 'echo', label: 'Echoing hi' },
      { type: 'tool_end', id: 'c1', ok: true, note: 'done' },
    ]);
  });

  it('tells the model about unknown and unavailable tools', async () => {
    const { content, events } = await exec(registryWith(tool(), tool({ name: 'hidden', isAvailable: () => false })), 'hidden', {});
    expect(content).toMatch(/Unknown tool "hidden". Available tools: echo/);
    expect(events[1]).toMatchObject({ ok: false, note: 'Tool not available' });
  });

  it('rejects invalid arguments without running the tool', async () => {
    const run = jest.fn();
    const { content, events } = await exec(registryWith(tool({ run })), 'echo', { text: '' });
    expect(run).not.toHaveBeenCalled();
    expect(content).toMatch(/Invalid arguments for echo/);
    expect(events[1]).toMatchObject({ ok: false, note: 'Invalid request' });
  });

  it('reports expected failures with their note, and hides unexpected error details', async () => {
    const failing = tool({ run: async () => { throw new ToolFailure('Search limit reached', 'Tell the user.'); } });
    const r1 = await exec(registryWith(failing), 'echo', { text: 'x' });
    expect(r1.content).toBe('Tell the user.');
    expect(r1.events[1]).toMatchObject({ ok: false, note: 'Search limit reached' });

    const crashing = tool({ run: async () => { throw new Error('postgres://secret'); } });
    const r2 = await exec(registryWith(crashing), 'echo', { text: 'x' });
    expect(r2.content).toMatch(/failed unexpectedly/);
    expect(JSON.stringify(r2)).not.toContain('secret');
  });

  it('rethrows when the request was aborted', async () => {
    const abort = new AbortController();
    const aborted = tool({ run: async () => { abort.abort(); throw new Error('aborted'); } });
    await expect(exec(registryWith(aborted), 'echo', { text: 'x' }, ctx(abort.signal))).rejects.toThrow('aborted');
  });

  it('truncates very large outputs', async () => {
    const big = tool({ run: async () => ({ content: 'x'.repeat(40_000) }) });
    const { content } = await exec(registryWith(big), 'echo', { text: 'x' });
    expect(content.length).toBeLessThan(31_000);
    expect(content).toMatch(/\[truncated\]$/);
  });
});
