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
const words = (n: number, tag = 'w') => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');

class Scripted implements ModelClient {
  readonly name = 'scripted';
  calls: ModelRequest[] = [];
  constructor(private replies: string[]) {}
  async stream(req: ModelRequest, onDelta: (d: string) => void) {
    this.calls.push(req);
    const text = this.replies.shift() ?? 'ok';
    onDelta(text);
    return { text, toolCalls: [], message: assistantMessage(text, []) } as never;
  }
}

it('cut adds [2] and [7] not in draft', async () => {
  const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
  const config = { get: (k: string) => settings[k] } as never;
  const draft = `${words(399)} claim [1].`;
  const cut = `${words(317)} claim [1] more [2] other [7].`;
  const model = new Scripted(['seed', draft, cut]);
  const store = new ConversationStore();
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  const svc = new AgentService(model, store, new FeatureFlagsService(config), tools, skills, config);
  const ev1: AgentEvent[] = [];
  await svc.run({ user, projectId: 'p1', sprintId: 's1', message: 'hi', signal: new AbortController().signal }, (e) => ev1.push(e));
  const id = (ev1.find((e) => e.type === 'conversation') as any).id;
  await store.addSources(id, [{ url: 'https://a', title: 'A' }, { url: 'https://b', title: 'B' }] as never);
  const ev: AgentEvent[] = [];
  await svc.run({ user, projectId: 'p1', sprintId: 's1', message: 'Write it in 330 words max', conversationId: id, signal: new AbortController().signal }, (e) => ev.push(e));
  console.log(JSON.stringify(ev.filter((e) => e.type !== 'text_delta').map((e: any) => e.type === 'text_replace' ? { type: e.type, tail: e.text.slice(-40) } : e), null, 1));
});
