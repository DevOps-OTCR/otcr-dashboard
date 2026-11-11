import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, CmsReader } from '../authorization/cms-read-access.service';
import { CmsReadService } from './cms-read.service';
import { ReadCursorService } from './read-cursor.service';
import * as schemas from './read.schemas';

describe('CMS read validation and failures', () => {
  const user: CmsReader = { id: 'reader', email: 'reader@illinois.edu', role: 'CONSULTANT' };
  let settings: Record<string, string>;
  let service: CmsReadService;
  const prisma = { project: { findUnique: jest.fn() } };
  beforeEach(() => {
    jest.resetAllMocks();
    settings = { AGENTIC_CMS_ENABLED: 'true' };
    const flags = new FeatureFlagsService({ get: (key: string) => settings[key] } as ConfigService);
    const db = prisma as unknown as PrismaService;
    service = new CmsReadService(db, new CmsReadAccessService(db, flags), flags, new ReadCursorService());
  });

  it('keeps overview pagination absent while defaulting list pagination', () => {
    expect(schemas.getDeliverableInput.parse({ projectId: 'p', deliverableId: 'd' })).toEqual({ projectId: 'p', deliverableId: 'd', section: 'overview' });
    expect(schemas.listDeliverablesInput.parse({ projectId: 'p' })).toEqual({ projectId: 'p', limit: 20 });
  });

  it.each([
    { projectId: '' }, { projectId: 'project', limit: 0 }, { projectId: 'project', limit: 51 },
    { projectId: 'project', limit: 1.5 }, { projectId: 'project', limit: '20' },
    { projectId: 'project', status: 'INVALID' }, { projectId: 'project', userId: 'admin' },
    { projectId: 'project', cursor: '' }, { projectId: 'project', cursor: 'a'.repeat(4097) },
  ])('rejects invalid filters/identity overrides before database queries', async input => {
    await expect(service.listDeliverables(user, input)).rejects.toMatchObject({ response: { code: 'INVALID_ARGUMENT' } });
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    { projectId: 'project', asOf: '2026-11-06T12:00:00Z' },
    { projectId: 'project', currentOnly: true, asOf: '2026-02-30T12:00:00Z' },
    { projectId: 'project', currentOnly: true, asOf: '2026-11-06T12:00:00' },
  ])('rejects invalid current-date arguments', async input => {
    await expect(service.listWorkstreams(user, input)).rejects.toMatchObject({ status: 400 });
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    { projectId: 'project', deliverableId: 'd', limit: 20 },
    { projectId: 'project', deliverableId: 'd', cursor: 'token' },
    { projectId: 'project', deliverableId: 'd', section: 'private' },
  ])('rejects invalid detail section/pagination arguments', async input => {
    await expect(service.getDeliverable(user, input)).rejects.toMatchObject({ status: 400 });
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('returns a safe database failure without logging source data', async () => {
    prisma.project.findUnique.mockRejectedValue(new Error('SQL credentials and client materials'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(service.listDeliverables(user, { projectId: 'project' })).rejects.toMatchObject({
        response: { code: 'CMS_UNAVAILABLE', message: 'CMS data is temporarily unavailable.' },
      });
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it('blocks all five entry points before validation/reads when disabled or pilot-denied', async () => {
    for (const config of [{ AGENTIC_CMS_ENABLED: 'false' }, { AGENTIC_CMS_ENABLED: 'true', AGENTIC_CMS_ALLOWED_EMAILS: 'other@illinois.edu' }]) {
      settings = config;
      for (const method of ['getProjectContext', 'listWorkstreams', 'getWorkstream', 'listDeliverables', 'getDeliverable'] as const) {
        await expect(service[method](user, {})).rejects.toMatchObject({ status: 404 });
      }
    }
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });
});

describe('Read cursors', () => {
  it('rejects another process key and malformed tokens without leaking token contents', () => {
    const signer = new ReadCursorService();
    const scope = signer.scope({ tool: 'list_deliverables', projectId: 'project', userId: 'reader' });
    const token = signer.encode(scope, { id: 'd1', sortValue: '2026-11-06T00:00:00Z', asOf: null });
    expect(signer.decode(token, scope).id).toBe('d1');
    for (const invalid of ['not-a-token', `${token}.extra`, token.replace(/.$/, '!'), `${token}=`]) {
      expect(() => signer.decode(invalid, scope)).toThrow('Start a new traversal without a cursor.');
    }
    expect(() => new ReadCursorService().decode(token, scope)).toThrow();
    expect(() => signer.decode(token, 'other-scope')).toThrow();
  });
});
