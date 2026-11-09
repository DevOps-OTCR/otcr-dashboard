import { AgentService } from '../../agent/agent.service';
import { ConversationStore } from '../../agent/conversation.store';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { assistantMessage, type ModelClient, type ModelRequest } from '../../model/model-client';
import { TavilySearchClient } from '../../search/tavily-search.client';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { WebSearchTool } from '../../tools/web-search.tool';
import type { AgentEvent } from '../../agent/agent.events';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const answers = (texts: string[]): ModelClient => { const seen: ModelRequest[] = []; return { name: 'a', async stream(req, onText) { seen.push(req); const t = texts[seen.length - 1]; onText(t); return { text: t, toolCalls: [], message: assistantMessage(t, []) }; } }; };
async function run(texts: string[]) {
  const config = { get: (k: string) => ({ AGENTIC_CMS_ENABLED: 'true' } as any)[k] } as never;
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  const svc = new AgentService(answers(texts), new ConversationStore(), new FeatureFlagsService(config), tools, skills, config);
  const events: AgentEvent[] = [];
  await svc.run({ user: { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' }, projectId: 'p1', sprintId: 's1', message: 'Write a 100-word summary', signal: new AbortController().signal } as any, (e) => events.push(e));
  const rep = events.flatMap((e) => (e.type === 'text_replace' ? [e.text] : []));
  return { end: events.find((e) => e.type === 'tool_end'), final: rep[rep.length - 1] };
}
it.each([[[150, 60, 70], 70], [[150, 79, 40], 79], [[150, 120, 30], 30]])('%j', async (seq, kept) => {
  const r = await run(seq.map(words));
  console.log(JSON.stringify(seq), JSON.stringify(r.end), r.final.split(/\s+/).length, /limit/.test(r.final));
  expect(r.final).toBe(words(kept));
  expect(r.end).toMatchObject({ ok: true });
});
