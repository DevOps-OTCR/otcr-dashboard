import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { AgentService } from '../../agent/agent.service';
import { ConversationStore } from '../../agent/conversation.store';
import { countDraftWords } from '../../agent/word-limit';
import type { ModelClient, ModelRequest } from '../../model/model-client';
import { TavilySearchClient } from '../../search/tavily-search.client';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { WebSearchTool } from '../../tools/web-search.tool';

const w = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const note = 'Word count (estimate): 90. Sources checked: S1 S2. Open items none here.'; // 12 words
class Seq implements ModelClient {
  readonly name = "seq";
  calls = 0;
  constructor(private replies: string[]) {}
  async stream(_r: ModelRequest) {
    const text = this.replies[Math.min(this.calls++, this.replies.length - 1)];
    return { text, toolCalls: [], message: { role: 'assistant', content: text } } as never;
  }
}
it('lost rule', async () => {
  const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
  const config = { get: (k: string) => settings[k] } as never;
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  const cut = `${w(90)}\n\n${note}`;
  console.log('count', countDraftWords(cut), 'withRule', countDraftWords(`${w(90)}\n\n---\n${note}`));
  const model = new Seq([`${w(120)}\n\n---\n${note}`, cut, w(95)]);
  const svc = new AgentService(model, new ConversationStore(), new FeatureFlagsService(config), tools, skills, config);
  const events: any[] = [];
  await svc.run({ user: { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' }, projectId: 'p1', sprintId: 's1', message: 'Write a 100-word summary', signal: new AbortController().signal }, (e) => events.push(e));
  console.log('calls', model.calls, JSON.stringify(events.filter((e) => e.type !== 'text_delta').map((e) => e.note ?? e.type)));
});
