import { NotFoundException } from '@nestjs/common';
import type { AgentUser } from '../agent/agent.types';
import type { CmsReader } from '../authorization/cms-read-access.service';
import type { CmsReadService } from '../reads/cms-read.service';
import { CmsReadTools } from './cms-read.tools';
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
});
