import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { PrismaService } from '../prisma/prisma.service';
import { FeedbackService } from './feedback.service';
import { GithubIssuesClient, GithubRequestError } from './github-issues.client';
import { GithubIssueSyncService } from './github-issue-sync.service';

// CI supplies an isolated migrated PostgreSQL database. No live GitHub calls.
const databaseTests = process.env.DATABASE_URL ? describe : describe.skip;
databaseTests('CMS GitHub delivery with PostgreSQL', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const config = new ConfigService({ CMS_GITHUB_ENABLED: 'true', CMS_GITHUB_REPOSITORY: 'test/cms' });
  const feedback = new FeedbackService(prisma as PrismaService, config);
  const github = {
    enabled: true, copilotEnabled: true, repository: 'test/cms',
    validateConfiguration: jest.fn(), findIssue: jest.fn(), createIssue: jest.fn(), assignCopilot: jest.fn(),
  };
  const worker = () => new GithubIssueSyncService(prisma as PrismaService, github as unknown as GithubIssuesClient);
  const ids: string[] = [];
  const simple = { problem: 'Fix typo in feedback heading', description: 'Replace "Feedbak" with "Feedback" in the heading on the feedback page.' };
  const submit = async (formType = 'DASHBOARD_FEEDBACK', body = simple) => {
    const submission = await feedback.createFormSubmission({}, formType as 'DASHBOARD_FEEDBACK', body);
    ids.push(submission.id);
    return submission.id as string;
  };
  const delivery = (id: string) => prisma.feedbackGithubDelivery.findUniqueOrThrow({ where: { id } });
  const ready = (id: string) => prisma.feedbackGithubDelivery.update({ where: { id }, data: { nextAttemptAt: new Date(0) } });

  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(() => {
    jest.clearAllMocks();
    github.findIssue.mockResolvedValue(undefined);
    github.createIssue.mockResolvedValue({ number: 42 });
    github.assignCopilot.mockResolvedValue(undefined);
    github.enabled = true;
    github.copilotEnabled = true;
  });
  afterEach(async () => {
    await prisma.feedbackSubmission.deleteMany({ where: { id: { in: ids.splice(0) } } });
  });
  afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

  it('persists the form and queue together, creates an issue, and assigns a simple fix', async () => {
    const id = await submit();
    expect((await delivery(id)).status).toBe('PENDING');
    await worker().syncPending();
    const result = await delivery(id);
    expect(result.issueNumber).toBe(42);
    expect(result.issueUrl).toBe('https://github.com/test/cms/issues/42');
    expect(result.result).toBe('COPILOT_ASSIGNED');
    expect(github.assignCopilot).toHaveBeenCalledWith(42);
    const items = await feedback.listFormSubmissions('DASHBOARD_FEEDBACK');
    expect(items.find(item => item.id === id).githubStatus).toBe('COPILOT_ASSIGNED');
    await worker().syncPending();
    expect(github.createIssue).toHaveBeenCalledTimes(1);
  });

  it('keeps anonymous and PRC submissions out of the queue', async () => {
    await submit('ANONYMOUS_FEEDBACK', { ...simple, urgency: 'NOT_VERY_URGENT' } as typeof simple);
    await submit('PRC');
    expect(await prisma.feedbackGithubDelivery.count({ where: { id: { in: ids } } })).toBe(0);
  });

  it('does not enqueue when the integration is disabled', async () => {
    config.set('CMS_GITHUB_ENABLED', 'false');
    try {
      const id = await submit();
      expect(await prisma.feedbackGithubDelivery.findUnique({ where: { id } })).toBeNull();
    } finally { config.set('CMS_GITHUB_ENABLED', 'true'); }
  });

  it('sends behavioral changes to review without starting Copilot', async () => {
    const id = await submit('DASHBOARD_FEEDBACK', { ...simple, problem: 'Fix role permissions' });
    await worker().syncPending();
    expect((await delivery(id)).result).toBe('NEEDS_REVIEW');
    expect(github.assignCopilot).not.toHaveBeenCalled();
  });

  it('serializes two workers with database leases', async () => {
    await submit();
    await Promise.all([worker().syncPending(), worker().syncPending()]);
    expect(github.createIssue).toHaveBeenCalledTimes(1);
    expect(github.assignCopilot).toHaveBeenCalledTimes(1);
  });

  it('recovers an expired worker lease by reconciling an already created issue', async () => {
    const id = await submit();
    await prisma.feedbackGithubDelivery.update({ where: { id }, data: {
      status: 'PROCESSING', leaseUntil: new Date(0), leaseToken: 'expired', createStartedAt: new Date(),
    } });
    github.findIssue.mockResolvedValue({ number: 55 });
    await worker().syncPending();
    expect((await delivery(id)).issueNumber).toBe(55);
    expect(github.createIssue).not.toHaveBeenCalled();
  });

  it('reconciles an ambiguous creation without sending another POST', async () => {
    const id = await submit();
    github.createIssue.mockRejectedValueOnce(new Error('network timeout'));
    await worker().syncPending();
    expect((await delivery(id)).lastErrorCode).toBe('CREATE_UNCONFIRMED');
    await ready(id);
    await worker().syncPending();
    expect(github.createIssue).toHaveBeenCalledTimes(1);
    github.findIssue.mockResolvedValue({ number: 66 });
    await ready(id);
    await worker().syncPending();
    expect((await delivery(id)).issueNumber).toBe(66);
    expect(github.createIssue).toHaveBeenCalledTimes(1);
  });

  it('retries an explicit GitHub rejection with backoff and a bounded attempt count', async () => {
    const id = await submit();
    github.createIssue.mockRejectedValue(new GithubRequestError(429));
    for (let attempt = 0; attempt < 8; attempt++) {
      await ready(id);
      await worker().syncPending();
    }
    const failed = await delivery(id);
    expect(failed.status).toBe('FAILED');
    expect(failed.createStartedAt).toBeNull();
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    github.createIssue.mockResolvedValue({ number: 42 });
    await feedback.retryGithubSync(id);
    await worker().syncPending();
    expect((await delivery(id)).status).toBe('COMPLETE');
  });

  it('retries Copilot separately after saving the issue number', async () => {
    const id = await submit();
    github.assignCopilot.mockRejectedValueOnce(new GithubRequestError(403));
    await worker().syncPending();
    expect((await delivery(id)).issueNumber).toBe(42);
    await ready(id);
    await worker().syncPending();
    expect(github.createIssue).toHaveBeenCalledTimes(1);
    expect((await delivery(id)).result).toBe('COPILOT_ASSIGNED');
  });

  it('pauses delivery when the integration is disabled', async () => {
    const id = await submit();
    github.enabled = false;
    await worker().syncPending();
    expect((await delivery(id)).status).toBe('PENDING');
    expect(github.createIssue).not.toHaveBeenCalled();
  });

  it('does not clear uncertain creation on an administrator retry', async () => {
    const id = await submit();
    await prisma.feedbackGithubDelivery.update({ where: { id }, data: {
      status: 'FAILED', createStartedAt: new Date(), lastErrorCode: 'CREATE_UNCONFIRMED',
    } });
    await feedback.retryGithubSync(id);
    await worker().syncPending();
    expect(github.createIssue).not.toHaveBeenCalled();
    expect((await delivery(id)).lastErrorCode).toBe('CREATE_UNCONFIRMED');
  });

  it('does not redirect queued reports when the configured repository changes', async () => {
    const id = await submit();
    await prisma.feedbackGithubDelivery.update({ where: { id }, data: { repository: 'other/repo' } });
    await worker().syncPending();
    expect(github.createIssue).not.toHaveBeenCalled();
    expect((await delivery(id)).lastErrorCode).toBe('SYNC_FAILED');
  });

  it('rejects oversized issue reports before creating either record', async () => {
    const count = await prisma.feedbackSubmission.count();
    await expect(feedback.createFormSubmission({}, 'DASHBOARD_FEEDBACK', {
      problem: 'x'.repeat(501), description: simple.description,
    })).rejects.toThrow('500 characters');
    expect(await prisma.feedbackSubmission.count()).toBe(count);
  });
});
