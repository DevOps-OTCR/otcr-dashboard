import { ForbiddenException } from '@nestjs/common';
import { MockWorkstreamTool } from './mock-workstream.tool';
import type { ToolContext } from './tool.types';
import { ToolFailure } from './tool.types';

const ctx = { user: { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' }, projectId: 'p1', sprintId: 's1' } as ToolContext;

describe('MockWorkstreamTool', () => {
  it('checks project access with the request user and scope, never model input', async () => {
    const assertProjectAccess = jest.fn(async () => ({ id: 'p1', pmId: 'pm' }));
    const out = await new MockWorkstreamTool({ assertProjectAccess } as never).run({}, ctx);
    expect(assertProjectAccess).toHaveBeenCalledWith('p1', ctx.user);
    expect(JSON.parse(out.content)).toMatchObject({ mock: true, projectId: 'p1', workstreamId: 's1' });
  });

  it('returns no data when access is denied', async () => {
    const assertProjectAccess = jest.fn(async () => { throw new ForbiddenException(); });
    await expect(new MockWorkstreamTool({ assertProjectAccess } as never).run({}, ctx)).rejects.toBeInstanceOf(ToolFailure);
  });
});
