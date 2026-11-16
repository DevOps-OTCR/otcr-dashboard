import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { McpServerService } from './mcp-server.service';

describe('MCP operation receipts', () => {
  const user = { id: 'reviewer', email: 'reviewer@illinois.edu', role: 'PM' as const };

  it.each([true, false])('handles mid-operation flag revocation for readOnly=%s', async (readOnly) => {
    const settings = { AGENTIC_CMS_ENABLED: 'true' };
    const flags = new FeatureFlagsService({ get: (key: string) => settings[key] } as ConfigService);
    const service = new McpServerService({} as never, flags, {} as never, {} as never);
    const receipt = { comments: [{ placement: 'native', nativeCommentId: 'posted-1' }] };
    const result = await service['call'](user, async () => {
      settings.AGENTIC_CMS_ENABLED = 'false';
      return receipt;
    }, readOnly);
    if (readOnly) {
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    } else {
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(receipt);
    }
    const nextOperation = jest.fn(async () => receipt);
    expect((await service['call'](user, nextOperation, readOnly)).isError).toBe(true);
    expect(nextOperation).not.toHaveBeenCalled();
  });
});
