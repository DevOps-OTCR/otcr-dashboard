import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type { AgentEvent } from '../../agent/agent.events';
import { AgentService } from '../../agent/agent.service';
import { ConversationStore } from '../../agent/conversation.store';
import { assistantMessage, type ModelClient, type ModelRequest } from '../../model/model-client';
import { TavilySearchClient } from '../../search/tavily-search.client';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { WebSearchTool } from '../../tools/web-search.tool';

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

function setup(model: ModelClient) {
  const store = new ConversationStore();
  const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
  const config = { get: (k: string) => settings[k] } as never;
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  return { store, svc: new AgentService(model, store, new FeatureFlagsService(config), tools, skills, config) };
}

describe('skeptic: abort during word-limit cut', () => {
  it('abort in cut drops already-streamed answer from history', async () => {
    const ac = new AbortController();
    let call = 0;
    const draft = words(400);
    const model: ModelClient = {
      stream: async (req: ModelRequest, onDelta: (d: string) => void) => {
        call++;
        if (call === 1) { onDelta(draft); return { text: draft, toolCalls: [], message: assistantMessage(draft, []) }; }
        ac.abort();
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
    } as never;
    const { svc, store } = setup(model);
    const events: AgentEvent[] = [];
    await expect(svc.run({ user, projectId: 'p1', sprintId: 's1', message: 'Write it in 350 words', signal: ac.signal }, (e) => events.push(e))).rejects.toBeTruthy();
    const streamed = events.flatMap((e) => (e.type === 'text_delta' ? [e.text] : [])).join('');
    const id = (events.find((e) => e.type === 'conversation') as any).id;
    const hist = await store.history(id);
    console.log('streamed words', streamed.split(/\s+/).length, 'events', events.map((e) => e.type), 'history', hist.map((m) => m.role));
    expect(streamed.split(/\s+/).length).toBe(400);
    expect(hist.some((m) => m.role === 'assistant')).toBe(false);
  });

  it('control: no limit, abort right after final stream (pre-commit-equivalent) saves the answer', async () => {
    const ac = new AbortController();
    const draft = words(400);
    const model: ModelClient = { stream: async (_r: ModelRequest, onDelta: (d: string) => void) => { onDelta(draft); ac.abort(); return { text: draft, toolCalls: [], message: assistantMessage(draft, []) }; } } as never;
    const { svc, store } = setup(model);
    const events: AgentEvent[] = [];
    await svc.run({ user, projectId: 'p1', sprintId: 's1', message: 'Write it', signal: ac.signal }, (e) => events.push(e));
    const id = (events.find((e) => e.type === 'conversation') as any).id;
    const hist = await store.history(id);
    console.log('control history', hist.map((m) => m.role));
    expect(hist.some((m) => m.role === 'assistant')).toBe(true);
  });
});
