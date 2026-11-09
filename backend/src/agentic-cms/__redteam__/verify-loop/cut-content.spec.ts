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
const answers = (texts: string[], seen: ModelRequest[] = []): ModelClient => ({
  name: 'answers',
  async stream(req, onText) { seen.push(req); const t = texts[seen.length - 1]; onText(t); return { text: t, toolCalls: [], message: assistantMessage(t, []) }; },
});
function setup(model: ModelClient) {
  const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
  const config = { get: (k: string) => settings[k] } as never;
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  return new AgentService(model, new ConversationStore(), new FeatureFlagsService(config), tools, skills, config);
}
async function run(model: ModelClient, msg: string) {
  const events: AgentEvent[] = [];
  await setup(model).run({ user, projectId: 'p1', sprintId: 's1', message: msg, signal: new AbortController().signal }, (e) => events.push(e));
  return events;
}
const replaced = (ev: AgentEvent[]) => ev.flatMap((e) => (e.type === 'text_replace' ? [e.text] : []));

describe('verify-loop: cut content checks', () => {
  it('accepts a cut that drops [DATA NEEDED], recommendation and reviewer note', async () => {
    const draft = `${words(400)} [DATA NEEDED: churn rate — decides payback — CRM export] Recommendation: launch.\n\n---\nWord count (estimate): 300 / 350`;
    const cut = words(320);
    const ev = await run(answers([draft, cut]), 'Write a 350-word summary');
    const out = replaced(ev).join('');
    console.log('tool_end', JSON.stringify(ev.find((e) => e.type === 'tool_end')));
    console.log('DATA NEEDED kept:', out.includes('DATA NEEDED'), 'Recommendation kept:', out.includes('Recommendation'), 'note kept:', out.includes('Word count'));
    expect(out).toBe(cut);
  });
});
