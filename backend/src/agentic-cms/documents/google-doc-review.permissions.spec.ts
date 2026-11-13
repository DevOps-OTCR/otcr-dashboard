import { ConfigService } from '@nestjs/config';
import type { Role } from '@prisma/client';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, CmsReader } from '../authorization/cms-read-access.service';
import { GoogleDocReviewService } from './google-doc-review.service';

// Real access rules and the real review service; only Prisma and Google are faked.
// Who may read or comment is decided by CmsReadAccessService, not by this service, so this
// pins the combination: no Google call may happen for anyone who is refused.

const FILE_URL = 'https://docs.google.com/document/d/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit';
const doc = { title: 'Paper', revisionId: 'r1', body: { content: [{ startIndex: 1, endIndex: 16, paragraph: { elements: [{ startIndex: 1, endIndex: 16, textRun: { content: 'alpha one here\n' } }] } }] } };
const target = { projectId: 'p1', deliverableId: 'd1', submissionId: 'sub1' };
const input = { ...target, comments: [{ quote: 'alpha one', comment: 'Tighten this.' }] };

type Project = { id: string; pmId: string; members: { userId: string }[] };
const asMember = (pmId = 'pm'): Project => ({ id: 'p1', pmId, members: [{ userId: 'self' }] });
const notMember = (pmId = 'pm'): Project => ({ id: 'p1', pmId, members: [] });

function setup(project: Project, enabled = 'true') {
  const settings: Record<string, string> = { AGENTIC_CMS_ENABLED: enabled };
  const prisma = {
    project: { findUnique: jest.fn(async () => project) },
    deliverable: { findFirst: jest.fn(async () => ({ id: 'd1' })) },
    submission: { findFirst: jest.fn(async () => ({ id: 'sub1', fileUrl: FILE_URL })) },
  };
  const flags = new FeatureFlagsService({ get: (key: string) => settings[key] } as ConfigService);
  const access = new CmsReadAccessService(prisma as unknown as PrismaService, flags);
  const client = {
    isConfigured: () => true,
    serviceAccountEmail: () => 'bot@proj.iam.gserviceaccount.com',
    getDocument: jest.fn(async () => doc),
    insertComment: jest.fn(async () => ({ commentId: 'k1', anchoredText: 'alpha one', nextRevisionId: 'r2', raw: {} })),
  };
  const service = new GoogleDocReviewService(prisma as unknown as PrismaService, access, flags, client as never);
  return { service, prisma, client };
}
const reader = (role: Role): CmsReader => ({ id: 'self', email: 'pilot@illinois.edu', role });
const refused = (promise: Promise<unknown>) =>
  promise.then(() => { throw new Error('expected a refusal'); }, (error) => error.getResponse());

describe('Google Doc review permissions', () => {
  const matrix: [string, Role, Project, boolean, boolean][] = [
    // name, role, project record, may comment, may read
    ['a consultant who is a project member', 'CONSULTANT', asMember(), false, true],
    ['a consultant who is not a member', 'CONSULTANT', notMember(), false, false],
    ['the PM who owns the project', 'PM', { id: 'p1', pmId: 'self', members: [] }, true, true],
    ["a PM from another project", 'PM', notMember('other'), false, false],
    ['an admin', 'ADMIN', notMember(), true, true],
    ['an LC who is a project member', 'LC', asMember(), true, true],
    // Pinned current behaviour: an LC outside the project is refused (see the hardening spec, B4).
    ['an LC who is not a project member', 'LC', notMember(), false, false],
  ];

  describe.each(matrix)('%s', (_name, role, project, mayComment, mayRead) => {
    it(mayComment ? 'may post comments' : 'is refused when posting, with no Google call', async () => {
      const { service, client } = setup(project);
      if (mayComment) {
        const out = await service.comment(reader(role), input);
        expect(out.comments.map((c) => c.placement)).toEqual(['native']);
        expect(client.insertComment).toHaveBeenCalledTimes(1);
      } else {
        expect(await refused(service.comment(reader(role), input))).toMatchObject({ code: 'NOT_FOUND_OR_FORBIDDEN' });
        expect(client.getDocument).not.toHaveBeenCalled();
        expect(client.insertComment).not.toHaveBeenCalled();
      }
    });

    it(mayRead ? 'may read' : 'is refused when reading, with no Google call', async () => {
      const { service, client } = setup(project);
      if (mayRead) {
        expect((await service.read(reader(role), target)).paragraphs).toHaveLength(1);
      } else {
        expect(await refused(service.read(reader(role), target))).toMatchObject({ code: 'NOT_FOUND_OR_FORBIDDEN' });
        expect(client.getDocument).not.toHaveBeenCalled();
      }
    });
  });

  it.each(['ADMIN', 'PM', 'CONSULTANT'] as Role[])('refuses a %s before touching any record when the feature is off', async (role) => {
    const { service, prisma, client } = setup({ id: 'p1', pmId: 'self', members: [{ userId: 'self' }] }, 'false');
    await refused(service.comment(reader(role), input));
    await refused(service.read(reader(role), target));
    for (const model of [prisma.project, prisma.deliverable, prisma.submission]) {
      for (const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
    }
    expect(client.getDocument).not.toHaveBeenCalled();
  });
});
