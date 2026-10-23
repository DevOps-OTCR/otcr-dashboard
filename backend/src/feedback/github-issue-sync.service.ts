import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assessIssue, IssueReport } from './github-issue-policy';
import { GithubIssuesClient, GithubRequestError } from './github-issues.client';

type Delivery = {
  id: string;
  repository: string;
  attempts: number;
  issueNumber: number | null;
  createStartedAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class GithubIssueSyncService {
  private readonly logger = new Logger(GithubIssueSyncService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly github: GithubIssuesClient) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async syncPending(): Promise<void> {
    if (!this.github.enabled || this.running) return;
    this.running = true;
    try {
      this.github.validateConfiguration();
      // Bound work per tick. Each item gets its own lease across API replicas.
      for (let index = 0; index < 5; index++) {
        const lease = randomUUID();
        const rows = await this.prisma.$queryRaw<Delivery[]>`
          UPDATE "FeedbackGithubDelivery" SET
            "status" = 'PROCESSING', "leaseToken" = ${lease},
            "leaseUntil" = NOW() + INTERVAL '5 minutes',
            "attempts" = "attempts" + 1, "updatedAt" = NOW()
          WHERE "id" IN (
            SELECT "id" FROM "FeedbackGithubDelivery"
            WHERE ("status" = 'PENDING' AND "nextAttemptAt" <= NOW())
               OR ("status" = 'PROCESSING' AND "leaseUntil" < NOW())
            ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
          ) RETURNING *
        `;
        if (!rows.length) break;
        await this.deliver(rows[0], lease);
      }
    } catch {
      this.logger.error('CMS GitHub synchronization unavailable; check configuration and database');
    } finally {
      this.running = false;
    }
  }

  private async deliver(delivery: Delivery, lease: string): Promise<void> {
    try {
      if (delivery.repository !== this.github.repository) throw new Error('Repository configuration changed');
      const reports = await this.prisma.$queryRaw<IssueReport[]>`
        SELECT "id", "problem", "description" FROM "FeedbackSubmission"
        WHERE "id" = ${delivery.id} AND "formType" = 'DASHBOARD_FEEDBACK'
      `;
      if (!reports[0]) throw new Error('Dashboard issue report is unavailable');
      const report = reports[0];
      if (!delivery.issueNumber) {
        let issue = await this.github.findIssue(delivery.id, delivery.createdAt);
        if (!issue) {
          // A timeout or crash after POST may have created an issue. Reconcile only.
          if (delivery.createStartedAt) throw new Error('CREATE_UNCONFIRMED');
          const marked = await this.prisma.$executeRaw`
            UPDATE "FeedbackGithubDelivery" SET "createStartedAt" = NOW()
            WHERE "id" = ${delivery.id} AND "leaseToken" = ${lease}
          `;
          if (!marked) return;
          delivery.createStartedAt = new Date();
          try {
            issue = await this.github.createIssue(report);
          } catch (error) {
            // Explicit rejection permits retry. A network failure or 5xx does not.
            if (error instanceof GithubRequestError && error.status >= 400 && error.status < 500 && error.status !== 408) {
              await this.prisma.$executeRaw`
                UPDATE "FeedbackGithubDelivery" SET "createStartedAt" = NULL
                WHERE "id" = ${delivery.id} AND "leaseToken" = ${lease}
              `;
              delivery.createStartedAt = null;
            }
            throw error;
          }
        }
        const url = `https://github.com/${delivery.repository}/issues/${issue.number}`;
        const saved = await this.prisma.$executeRaw`
          UPDATE "FeedbackGithubDelivery" SET "issueNumber" = ${issue.number},
            "issueUrl" = ${url}, "attempts" = 0, "updatedAt" = NOW()
          WHERE "id" = ${delivery.id} AND "leaseToken" = ${lease}
        `;
        if (!saved) return;
        delivery.issueNumber = issue.number;
        delivery.attempts = 0;
      }
      const simple = assessIssue(report) === 'simple';
      if (simple && this.github.copilotEnabled) await this.github.assignCopilot(delivery.issueNumber);
      const result = simple && this.github.copilotEnabled ? 'COPILOT_ASSIGNED' : 'NEEDS_REVIEW';
      await this.prisma.$executeRaw`
        UPDATE "FeedbackGithubDelivery" SET "status" = 'COMPLETE', "result" = ${result},
          "leaseUntil" = NULL, "leaseToken" = NULL, "lastErrorCode" = NULL, "updatedAt" = NOW()
        WHERE "id" = ${delivery.id} AND "leaseToken" = ${lease}
      `;
    } catch (error) {
      const uncertain = !delivery.issueNumber && delivery.createStartedAt;
      const code = uncertain ? 'CREATE_UNCONFIRMED' :
        error instanceof GithubRequestError ? `GITHUB_HTTP_${error.status}` : 'SYNC_FAILED';
      const status = delivery.attempts >= 8 ? 'FAILED' : 'PENDING';
      const retryAt = new Date(Date.now() + Math.min(3600, 60 * 2 ** delivery.attempts) * 1000);
      await this.prisma.$executeRaw`
        UPDATE "FeedbackGithubDelivery" SET "status" = ${status}, "lastErrorCode" = ${code},
          "nextAttemptAt" = ${retryAt}, "leaseToken" = NULL, "leaseUntil" = NULL, "updatedAt" = NOW()
        WHERE "id" = ${delivery.id} AND "leaseToken" = ${lease}
      `;
      this.logger.warn(`CMS GitHub delivery ${delivery.id}: ${code} (${status})`);
    }
  }
}
