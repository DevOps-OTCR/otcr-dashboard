import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService } from './cms-read-access.service';

describe('project context write access', () => {
  const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: 'true' };
  const prisma = {
    project: { findUnique: jest.fn() },
  };
  let service: CmsReadAccessService;
  const reader = { id: 'member', email: 'pilot@example.test', role: 'CONSULTANT' as const };
  beforeEach(() => {
    jest.clearAllMocks(); settings.AGENTIC_CMS_ALLOWED_EMAILS = '';
    service = new CmsReadAccessService(prisma as unknown as PrismaService,
      new FeatureFlagsService({ get: (key: string) => settings[key] } as ConfigService));
  });
  it('allows project members to read but not write context', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p', pmId: 'pm', members: [{ userId: 'member' }] });
    await expect(service.projectScope(reader, 'p', 'deliverables')).resolves.toBeDefined();
    await expect(service.assertContextWrite(reader, 'p')).rejects.toThrow();
  });
  it('allows an owning PM and denies a PM from another project', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p', pmId: 'member', members: [] });
    await expect(service.assertContextWrite({ ...reader, role: 'PM' }, 'p')).resolves.toBeUndefined();
    prisma.project.findUnique.mockResolvedValue({ id: 'p', pmId: 'other', members: [] });
    await expect(service.assertContextWrite({ ...reader, role: 'PM' }, 'p')).rejects.toThrow();
  });
  it('fails closed when the release flag is off', async () => {
    settings.AGENTIC_CMS_ENABLED = 'false';
    await expect(service.assertContextWrite({ ...reader, role: 'ADMIN' }, 'p')).rejects.toThrow();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });
});
