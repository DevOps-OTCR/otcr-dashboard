import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  private tableReady = false;

  private get feedbackModelOrNull() {
    return (this.prisma as any).feedbackSubmission ?? null;
  }

  private getDisplayName(firstName?: string | null, lastName?: string | null, email?: string | null): string {
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    return fullName || 'Team member';
  }

  private async ensureFeedbackTable() {
    if (this.tableReady) return;
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FeedbackSubmission" (
        "id" TEXT PRIMARY KEY,
        "problem" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "submitterId" TEXT NULL,
        "submitterEmail" TEXT NOT NULL,
        "submitterName" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "FeedbackSubmission_createdAt_idx"
      ON "FeedbackSubmission" ("createdAt");
    `);
    this.tableReady = true;
  }

  async createSubmission(user: any, body: { problem?: string; description?: string }) {
    const problem = body?.problem?.trim();
    const description = body?.description?.trim();

    if (!problem) {
      throw new BadRequestException('Problem is required');
    }
    if (!description) {
      throw new BadRequestException('Description is required');
    }

    const model = this.feedbackModelOrNull;
    if (model) {
      return model.create({
        data: {
          problem,
          description,
          submitterId: user?.id ?? null,
          submitterEmail: String(user?.email ?? '').toLowerCase(),
          submitterName: this.getDisplayName(user?.firstName, user?.lastName, user?.email),
        },
      });
    }

    await this.ensureFeedbackTable();
    const id = randomUUID();
    const submitterEmail = String(user?.email ?? '').toLowerCase();
    const submitterName = this.getDisplayName(user?.firstName, user?.lastName, user?.email);
    await this.prisma.$executeRaw`
      INSERT INTO "FeedbackSubmission"
      ("id", "problem", "description", "submitterId", "submitterEmail", "submitterName", "createdAt", "updatedAt")
      VALUES
      (${id}, ${problem}, ${description}, ${user?.id ?? null}, ${submitterEmail}, ${submitterName}, NOW(), NOW())
    `;
    const inserted = await this.prisma.$queryRaw<any[]>`
      SELECT
        "id",
        "problem",
        "description",
        "submitterId",
        "submitterEmail",
        "submitterName",
        "createdAt",
        "updatedAt"
      FROM "FeedbackSubmission"
      WHERE "id" = ${id}
      LIMIT 1
    `;
    return inserted[0] ?? null;
  }

  async listSubmissions() {
    const model = this.feedbackModelOrNull;
    if (model) {
      return model.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    await this.ensureFeedbackTable();
    return this.prisma.$queryRaw<any[]>`
      SELECT
        "id",
        "problem",
        "description",
        "submitterId",
        "submitterEmail",
        "submitterName",
        "createdAt",
        "updatedAt"
      FROM "FeedbackSubmission"
      ORDER BY "createdAt" DESC
    `;
  }
}
