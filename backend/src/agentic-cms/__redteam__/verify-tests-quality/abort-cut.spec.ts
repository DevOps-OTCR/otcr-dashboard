import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { AgentError } from '../../agent/agent-errors';
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
const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
const setup = (model: ModelClient) => {
  const store = new ConversationStore();
  const config = { get: (k: string) => settings[k] } as never;
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  return { store, svc: new AgentService(model, store, new FeatureFlagsService(config), tools, skills, config) };
};

describe('redteam verify: abort during cut', () => {
  it('abort during the cut rejects, no text_replace, only user message saved', async () => {
    const ac = new AbortController();
    const seen: ModelRequest[] = [];
    const model: ModelClient = {
      name: 'x',
      async stream(req, onText) {
        seen.push(req);
        if (seen.length === 1) { onText(words(486)); return { text: words(486), toolCalls: [], message: assistantMessage(words(486), []) }; }
        ac.abort();
        throw new AgentError('aborted' as never, 'stopped', false);
      },
    };
    const { svc, store } = setup(model);
    const events: AgentEvent[] = [];
    let convo: string | undefined;
    const p = svc.run({ user, projectId: 'p1', sprintId: 's1', message: 'Write a 350-word summary', signal: ac.signal }, (e) => { events.push(e); if (e.type === 'conversation') convo = e.id; });
    await expect(p).rejects.toBeDefined();
    expect(events.some((e) => e.type === 'text_replace')).toBe(false);
    expect((await store.history(convo!)).map((m) => m.role)).toEqual(['user']);
  });

  it('cut requests carry the request abort signal', async () => {
    const ac = new AbortController();
    const seen: ModelRequest[] = [];
    const texts = [words(486), words(300)];
    const model: ModelClient = { name: 'x', async stream(req, onText) { seen.push(req); const t = texts[seen.length - 1]; onText(t); return { text: t, toolCalls: [], message: assistantMessage(t, []) }; } };
    const { svc } = setup(model);
    await svc.run({ user, projectId: 'p1', sprintId: 's1', message: 'Write a 350-word summary', signal: ac.signal }, () => undefined);
    expect(seen).toHaveLength(2);
    expect(seen[1].signal).toBe(ac.signal);
  });
});
