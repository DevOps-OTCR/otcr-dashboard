import { NotFoundException } from '@nestjs/common';
import type { AgentUser } from '../agent/agent.types';
import type { CmsReadService } from '../reads/cms-read.service';
import { CmsReadTools, localTimes, withLocalTimes } from './cms-read.tools';
import { ToolFailure } from './tool.types';
import type { ToolContext } from './tool.types';

const user = { id: 'u1', email: 'a@b.c' } as unknown as AgentUser;

function makeCtx(): ToolContext {
  return {
    user,
    projectId: 'selected',
    signal: new AbortController().signal,
    addSources: async () => [],
  };
}

function fakeReads(overrides: Partial<Record<keyof CmsReadService, jest.Mock>> = {}): CmsReadService {
  const base = {
    getProjectContext: jest.fn(),
    listWorkstreams: jest.fn(),
    getWorkstream: jest.fn(),
    listDeliverables: jest.fn(),
    getDeliverable: jest.fn(),
  };
  return { ...base, ...overrides } as unknown as CmsReadService;
}

function toolNamed(tools: CmsReadTools, name: string) {
  const t = tools.tools.find(x => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe('local times for CMS timestamps', () => {
  // The failing live case: the "Market sizing model" deliverable was due 2026-11-14T23:00:00.000Z.
  // The model reported it as 11:00 pm, then 6:00 pm, America/Chicago; it is 5:00 PM CST.
  const workstream = {
    timezone: 'America/Chicago', truncatedFields: [], retrievedAt: '2026-11-11T00:00:00.000Z',
    workstream: { id: 'week-3', weekStartDate: '2026-11-09T00:00:00.000Z', weekEndDate: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' },
    deliverablesAccess: 'allowed',
    deliverables: { items: [{ id: 'd1', title: 'Market sizing model', deadline: '2026-11-14T23:00:00.000Z' }], nextCursor: null },
  };

  it('converts the failed deadline on the server: 23:00Z on Nov 14 is 5:00 PM CST', async () => {
    const getWorkstream = jest.fn().mockResolvedValue(workstream);
    const tool = toolNamed(new CmsReadTools(fakeReads({ getWorkstream })), 'get_workstream');
    const out = await tool.run(tool.input.parse({ projectId: 'selected', workstreamId: 'week-3' }) as never, makeCtx());
    const decoded = JSON.parse(out.content);
    expect(decoded.localTimes.timezone).toBe('America/Chicago');
    expect(decoded.localTimes.times).toEqual({ '/deliverables/items/0/deadline': 'Sat, Nov 14, 2026, 5:00 PM CST' });
    expect(decoded.localTimes.about).toMatch(/don't convert times yourself/);
    // Week labels are calendar dates and are never converted (Nov 9 would become Nov 8).
    expect(decoded.localTimes.about).toMatch(/weekStartDate and weekEndDate are calendar dates/);
    expect(decoded.workstream.weekStartDate).toBe('2026-11-09T00:00:00.000Z');
  });

  it('uses the right offset on each side of the daylight-saving change', () => {
    expect(localTimes({ a: { deadline: '2026-10-30T22:00:00.000Z' }, b: { deadline: '2026-11-14T23:00:00Z' } }, 'America/Chicago')).toEqual({
      '/a/deadline': 'Fri, Oct 30, 2026, 5:00 PM CDT',
      '/b/deadline': 'Sat, Nov 14, 2026, 5:00 PM CST',
    });
  });

  it('marks times UTC when the result has no timezone or an unknown one', () => {
    const context = { project: { id: 'p' }, notes: { items: [{ id: 'n', createdAt: '2026-11-02T15:30:00.000Z' }], nextCursor: null } };
    const shown = withLocalTimes(context) as typeof context & { localTimes: { about: string; times: Record<string, string>; timezone?: string } };
    expect(shown.localTimes.times).toEqual({ '/notes/items/0/createdAt': '2026-11-02T15:30:00.000Z (UTC)' });
    expect(shown.localTimes.about).toMatch(/are UTC/);
    expect(shown.localTimes.timezone).toBeUndefined();
    const unknownZone = withLocalTimes({ ...context, timezone: 'Not/AZone' }) as unknown as { localTimes: { times: Record<string, string> } };
    expect(unknownZone.localTimes.times['/notes/items/0/createdAt']).toMatch(/\(UTC\)$/);
  });

  it('leaves results without timestamps unchanged', () => {
    const result = { overview: 'hello', truncatedFields: [] };
    expect(withLocalTimes(result)).toBe(result);
  });

  it('formats all 50 deliverable deadlines in a page, including the last one', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `d${i}`, title: `Deliverable ${i}`, deadline: '2026-11-14T23:00:00.000Z',
    }));
    const page = { timezone: 'America/Chicago', deliverables: { items, nextCursor: null } };
    const shown = withLocalTimes(page) as unknown as { localTimes: { about: string; times: Record<string, string> } };
    expect(Object.keys(shown.localTimes.times)).toHaveLength(50);
    expect(shown.localTimes.times['/deliverables/items/49/deadline']).toBe('Sat, Nov 14, 2026, 5:00 PM CST');
    expect(shown.localTimes.about).not.toMatch(/incomplete/);
  });

  it('keeps only the first 200 timestamps when a page has more, and says so', () => {
    const items = Array.from({ length: 201 }, (_, i) => ({ id: `d${i}`, deadline: '2026-11-14T23:00:00.000Z' }));
    const page = { timezone: 'America/Chicago', deliverables: { items, nextCursor: null } };
    const shown = withLocalTimes(page) as unknown as { localTimes: { about: string; times: Record<string, string> } };
    expect(Object.keys(shown.localTimes.times)).toHaveLength(200);
    expect(shown.localTimes.times['/deliverables/items/200/deadline']).toBeUndefined();
    expect(shown.localTimes.times['/deliverables/items/0/deadline']).toBe('Sat, Nov 14, 2026, 5:00 PM CST');
    expect(shown.localTimes.about).toMatch(/incomplete/);
    expect(shown.localTimes.about).toMatch(/still UTC/);
  });

  it('gives the calendar-date note when a result has only week dates and no timestamps', () => {
    const result = {
      workstreams: {
        items: [{
          weekStartDate: '2026-11-09T00:00:00.000Z',
          weekEndDate: '2026-11-15T00:00:00.000Z',
        }],
      },
    };
    const shown = withLocalTimes(result) as typeof result & { localTimes: { about: string; times: Record<string, string>; timezone?: string } };
    expect(shown.workstreams.items[0].weekStartDate).toBe('2026-11-09T00:00:00.000Z');
    expect(shown.localTimes.times).toEqual({});
    expect(shown.localTimes.timezone).toBeUndefined();
    expect(shown.localTimes.about).toMatch(/calendar dates/);
    expect(shown.localTimes.about).not.toMatch(/Server-converted/);
    expect(shown.localTimes.about).not.toMatch(/are UTC/);
  });
});

describe('CmsReadTools', () => {
  it('ignores model-supplied projectId and uses the context project', async () => {
    const getProjectContext = jest.fn().mockResolvedValue({ overview: 'x' });
    const reads = fakeReads({ getProjectContext });
    const tools = new CmsReadTools(reads);
    const tool = toolNamed(tools, 'get_project_context');
    const input = { projectId: 'other' } as Record<string, unknown>;
    const parsed = tool.input.parse(input);
    await tool.run(parsed as never, makeCtx());
    expect(getProjectContext).toHaveBeenCalledTimes(1);
    const args = getProjectContext.mock.calls[0];
    expect(args[1]).toMatchObject({ projectId: 'selected' });
    expect(args[1].projectId).not.toBe('other');
    expect(args[0]).toBe(user);
  });

  it('returns JSON content that preserves truncatedFields', async () => {
    const result = { overview: 'hello', truncatedFields: ['overview'] };
    const getProjectContext = jest.fn().mockResolvedValue(result);
    const reads = fakeReads({ getProjectContext });
    const tools = new CmsReadTools(reads);
    const tool = toolNamed(tools, 'get_project_context');
    const parsed = tool.input.parse({ projectId: 'selected' });
    const out = await tool.run(parsed as never, makeCtx());
    expect(out.content).toContain(JSON.stringify(result));
    const decoded = JSON.parse(out.content.split('\n\n')[0]);
    expect(decoded.truncatedFields).toEqual(['overview']);
  });

  it('translates not-found HttpException without leaking the raw message', async () => {
    const getProjectContext = jest.fn().mockRejectedValue(
      new NotFoundException({ code: 'NOT_FOUND_OR_FORBIDDEN', message: 'secret client text' }),
    );
    const reads = fakeReads({ getProjectContext });
    const tools = new CmsReadTools(reads);
    const tool = toolNamed(tools, 'get_project_context');
    const parsed = tool.input.parse({ projectId: 'selected' });
    await expect(tool.run(parsed as never, makeCtx())).rejects.toBeInstanceOf(ToolFailure);
    try {
      await tool.run(parsed as never, makeCtx());
    } catch (err) {
      const f = err as ToolFailure;
      expect(f.note).not.toContain('secret');
      expect(f.modelMessage).not.toContain('secret');
      expect(f.modelMessage).toBe('The requested CMS record is unavailable.');
    }
  });

  it('maps bare 404 to FEATURE_UNAVAILABLE without leaking the exception message', async () => {
    const getProjectContext = jest.fn().mockRejectedValue(new NotFoundException());
    const reads = fakeReads({ getProjectContext });
    const tools = new CmsReadTools(reads);
    const tool = toolNamed(tools, 'get_project_context');
    const parsed = tool.input.parse({ projectId: 'selected' });
    await expect(tool.run(parsed as never, makeCtx())).rejects.toBeInstanceOf(ToolFailure);
    try {
      await tool.run(parsed as never, makeCtx());
    } catch (err) {
      const f = err as ToolFailure;
      expect(f.modelMessage).toBe('Agentic CMS is unavailable.');
      expect(f.note).not.toContain('temporarily');
      expect(f.modelMessage).not.toContain('temporarily');
    }
  });
});
