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

describe('skeptic: cost amplification', () => {
  it('word-limit adds at most 2 calls per message; tool rounds (pre-existing) already add up to 5 uncounted', async () => {
    const seen: ModelRequest[] = [];
    const cyc: ModelClient = { name: 'c', async stream(req) { seen.push(req); const t = [words(300), words(10), words(10)][(seen.length - 1) % 3]; return { text: t, toolCalls: [], message: assistantMessage(t, []) }; } };
    const { svc, store } = setup(cyc);
    let convo: string | undefined;
    for (let i = 0; i < 5; i++) convo = (await runTurn(svc, 'Answer in 50 words: x', convo)).conversationId;
    console.log('WL calls', seen.length, 'counted', await store.userMessagesLastHour('u1'), 'cut tools', JSON.stringify(seen[1].tools));
    expect(seen.length).toBe(15);

    // pre-existing: a model that keeps calling tools uses MAX_ROUNDS=6 calls per counted message
    const seen2: ModelRequest[] = [];
    const looping: ModelClient = { name: 'l', async stream(req) { seen2.push(req); const calls = [{ id: 'c' + seen2.length, name: 'load_skill', arguments: { name: 'research' } }]; return { text: '', toolCalls: calls as any, message: assistantMessage('', calls as any) }; } };
    const s2 = setup(looping);
    await runTurn(s2.svc, 'hi');
    console.log('tool-loop calls for 1 message', seen2.length, 'counted', await s2.store.userMessagesLastHour('u1'));
    // and stopping at MAX_ROUNDS never reaches enforceWordLimit, so worst case stays 6
    const seen3: ModelRequest[] = [];
    const looping3: ModelClient = { name: 'l3', async stream(req) { seen3.push(req); const calls = [{ id: 'c' + seen3.length, name: 'load_skill', arguments: { name: 'research' } }]; return { text: words(300), toolCalls: calls as any, message: assistantMessage(words(300), calls as any) }; } };
    const s3 = setup(looping3);
    await runTurn(s3.svc, 'Answer in 50 words: x');
    console.log('tool-loop + limit calls', seen3.length);
  });
});
