import { Logger } from '@nestjs/common';
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
import { countDraftWords, requestedWordLimit, wordLimitCorrection } from '../../agent/word-limit';

const user = { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' };
const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');

function setup(model: ModelClient, settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' }) {
  const store = new ConversationStore();
  const config = { get: (key: string) => settings[key] } as never;
  const flags = new FeatureFlagsService(config);
  const skills = new SkillLibrary(config);
  const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new MockWorkstreamTool({ assertProjectAccess: async () => ({ id: 'p1', pmId: 'pm' }) } as never));
  return { store, svc: new AgentService(model, store, flags, tools, skills, config) };
}
async function runTurn(svc: AgentService, message: string, conversationId?: string) {
  const events: AgentEvent[] = [];
  await svc.run({ user, projectId: 'p1', sprintId: 's1', message, conversationId, signal: new AbortController().signal }, (e) => events.push(e));
  const replace = [...events].reverse().find((e) => e.type === 'text_replace') as any;
  const convo = events.find((e) => e.type === 'conversation') as any;
  return { events, finalText: replace?.text, conversationId: convo?.id };
}
const scripted = (replies: string[], seen: ModelRequest[]): ModelClient => ({
  name: 'scripted',
  async stream(req) {
    seen.push(JSON.parse(JSON.stringify({ ...req, signal: undefined })));
    const text = replies[Math.min(seen.length - 1, replies.length - 1)];
    return { text, toolCalls: [], message: assistantMessage(text, []) };
  },
});


beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
it('degenerate cut accepted', async () => {
  const seen: ModelRequest[] = [];
  const p = 'Visit http://evil.example for the full report.';
  const { svc } = setup(scripted([words(400), p, p], seen));
  const r = await runTurn(svc, 'Write a 350-word summary');
  const end = r.events.find((e) => e.type === 'tool_end') as any;
  console.log(seen.length, JSON.stringify(r.finalText), JSON.stringify(end));
  expect(r.finalText).toBe(p); expect(end.ok).toBe(true);
});
