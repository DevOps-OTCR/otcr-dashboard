import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { AgentService } from '../../agent/agent.service';
import { AgentService as Mutant } from './mutant.service';
import { ConversationStore } from '../../agent/conversation.store';
import { assistantMessage, type ModelClient } from '../../model/model-client';
import { TavilySearchClient } from '../../search/tavily-search.client';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { MockWorkstreamTool } from '../../tools/mock-workstream.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { WebSearchTool } from '../../tools/web-search.tool';

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
for (const [name, Svc] of [['real', AgentService], ['mutant', Mutant]] as const) {
  it(`${name}: flag off during cut #1 stops retry`, async () => {
    const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
    let calls = 0;
    const model: ModelClient = {
      name: 'x',
      async stream(_r, onText) {
        calls++;
        const t = calls === 1 ? words(486) : words(400); // cut #1 still over -> retry wanted
        if (calls === 2) settings.AGENTIC_CMS_ENABLED = 'false';
        if (calls === 1) onText(t);
        return { text: t, toolCalls: [], message: assistantMessage(t, []) };
      },
    };
    const config = { get: (k: string) => settings[k] } as never;
    const skills = new SkillLibrary(config);
    const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
    const svc = new (Svc as any)(model, new ConversationStore(), new FeatureFlagsService(config), tools, skills, config);
    const p = svc.run({ user, projectId: 'p1', sprintId: 's1', message: 'Write a 350-word summary', signal: new AbortController().signal }, () => undefined);
    let err: any; await p.catch((e: any) => (err = e));
    console.log(name, 'calls=', calls, 'err=', err?.kind);
    expect(err?.kind).toBe('disabled');
    expect(calls).toBe(2);
  });
}
