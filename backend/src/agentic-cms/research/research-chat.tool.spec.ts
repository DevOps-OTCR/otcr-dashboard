import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { AgentService } from '../agent/agent.service';
import { ConversationStore } from '../agent/conversation.store';
import { AgentEvent } from '../agent/agent.events';
import { RunInput } from '../agent/agent.types';
import { assistantMessage } from '../model/model-client';
import { SkillLibrary } from '../skills/skill-library';
import { ToolRegistry } from '../tools/tool-registry';
import { WebSearchTool } from '../tools/web-search.tool';
import { LoadSkillTool } from '../tools/load-skill.tool';
import { CmsReadTools } from '../tools/cms-read.tools';
import { TavilySearchClient } from '../search/tavily-search.client';
import { ResearchChatTool, researchChatContext } from './research-chat.tool';
import { ResearchEditService } from './research-edit.service';

const input = (): RunInput => ({ user: { id: 'u', email: 'u@example.test', role: 'CONSULTANT' }, projectId: 'project', message: 'Shorten past data', signal: new AbortController().signal, research: { deliverableId: 'deliverable', expectedVersion: 2, editingBlocked: false } });
const saved = { status: 'saved', summary: 'Shortened past data', changes: ['Edited past data'], previousVersion: 2, savedVersion: 3, workspace: { document: 'Never put the full workspace in chat history' } };
describe('Research editing through the existing bot', () => {
  const edit = jest.fn();
  const setup = () => new ResearchChatTool({ edit } as unknown as ResearchEditService);
  beforeEach(() => { edit.mockReset().mockResolvedValue(saved); });
  it('offers an argument-free action only with a selected workspace', () => {
    const request = input(); delete request.research;
    expect(setup().forTurn(request, () => {})).toEqual([]);
    expect(setup().forTurn(input(), () => {})[0].input.safeParse({ prompt: 'model-invented instruction' }).success).toBe(false);
  });
  it('uses verified request identity, original prompt and selected version; repeated calls save only once', async () => {
    const request = input(); const events: AgentEvent[] = [];
    const [tool] = setup().forTurn(request, e => events.push(e));
    const first = await tool.run({}, {} as never); await tool.run({}, {} as never);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledWith(request.user, 'project', 'deliverable', { expectedVersion: 2, prompt: request.message, clarifications: [] }, request.signal);
    expect(events).toEqual([{ type: 'research_edit', projectId: 'project', deliverableId: 'deliverable', result: { status: 'saved', summary: saved.summary, changes: saved.changes, previousVersion: 2, savedVersion: 3 } }]);
    expect(first.content).not.toContain('Never put');
  });
  it('returns clarification state without inventing a revised prompt and forwards actual answers', async () => {
    edit.mockResolvedValue({ status: 'clarification', question: 'Which section?' });
    const request = input(); request.research.pending = { prompt: 'Shorten it', clarifications: [{ question: 'Which section?', answer: 'Past data' }] };
    const events: AgentEvent[] = [];
    await setup().forTurn(request, e => events.push(e))[0].run({}, {} as never);
    expect(edit.mock.calls[0][3]).toEqual({ expectedVersion: 2, ...request.research.pending });
    expect(events[0]).toMatchObject({ result: { status: 'clarification', pending: request.research.pending } });
  });
  it('blocks draft/read-only/conflict contexts before invoking editing', async () => {
    const request = input(); request.research.editingBlocked = true;
    await expect(setup().forTurn(request, () => {})[0].run({}, {} as never)).rejects.toMatchObject({ note: 'Research editing blocked' });
    expect(edit).not.toHaveBeenCalled();
  });
  it('reports conflicts without emitting a saved event', async () => {
    edit.mockRejectedValue(new ConflictException({ code: 'VERSION_CONFLICT' })); const events: AgentEvent[] = [];
    await expect(setup().forTurn(input(), e => events.push(e))[0].run({}, {} as never)).rejects.toMatchObject({ modelMessage: expect.stringContaining('Reload saved research') });
    expect(events).toEqual([]);
  });
  it('validates nested context and rejects forged fields and excessive clarification history', () => {
    expect(researchChatContext.safeParse({ ...input().research, authorId: 'other' }).success).toBe(false);
    expect(researchChatContext.safeParse({ ...input().research, expectedVersion: 0 }).success).toBe(false);
    expect(researchChatContext.safeParse({ ...input().research, pending: { prompt: 'x', clarifications: Array(4).fill({ question: 'x', answer: 'x' }) } }).success).toBe(false);
  });
  it.each([true, false])('real agent routing observes feature enabled=%s', async enabled => {
    const config = { get: (key: string) => key === 'AGENTIC_CMS_ENABLED' ? String(enabled) : undefined } as ConfigService;
    const skills = new SkillLibrary(config);
    const tools = new ToolRegistry(new WebSearchTool(new TavilySearchClient(config)), new LoadSkillTool(skills), new CmsReadTools({} as never));
    const stream = jest.fn(async (req, onText) => {
      if (req.messages.some(m => m.role === 'tool')) {
        onText('Saved the edit.'); return { text: 'Saved the edit.', toolCalls: [], message: assistantMessage('Saved the edit.', []) };
      }
      expect(req.tools.some(t => t.name === 'edit_research_workspace')).toBe(true);
      const calls = [{ id: 'edit-call', name: 'edit_research_workspace', args: {} }];
      return { text: '', toolCalls: calls, message: assistantMessage('', calls) };
    });
    const agent = new AgentService({ name: 'test', stream }, new ConversationStore(), new FeatureFlagsService(config), tools, skills, config, setup());
    const events: AgentEvent[] = [];
    if (enabled) {
      await agent.run(input(), e => events.push(e));
      expect(events.some(e => e.type === 'research_edit')).toBe(true); expect(edit).toHaveBeenCalledTimes(1);
    } else {
      await expect(agent.run(input(), e => events.push(e))).rejects.toThrow();
      expect(stream).not.toHaveBeenCalled(); expect(edit).not.toHaveBeenCalled();
    }
  });
});
