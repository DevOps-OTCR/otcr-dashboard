import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

type FormType = 'DASHBOARD_FEEDBACK' | 'ANONYMOUS_FEEDBACK' | 'PRC';
type Urgency = 'VERY_URGENT' | 'SOMEWHAT_URGENT' | 'NOT_VERY_URGENT';

type FormSubmissionInput = {
  problem?: string;
  description?: string;
  urgency?: string;
  contactName?: string;
  contactEmail?: string;
};

const FORM_TYPES: FormType[] = ['DASHBOARD_FEEDBACK', 'ANONYMOUS_FEEDBACK', 'PRC'];
const URGENCY_VALUES: Urgency[] = ['VERY_URGENT', 'SOMEWHAT_URGENT', 'NOT_VERY_URGENT'];

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  private tableReady = false;

  parseFormType(value: string): FormType {
    if (FORM_TYPES.includes(value as FormType)) {
      return value as FormType;
    }
    throw new BadRequestException('Invalid form type');
  }

  canReviewFormSubmissions(formType: FormType, role?: string | null): boolean {
    if (formType === 'DASHBOARD_FEEDBACK') {
      return role === 'ADMIN';
    }
    return role === 'ADMIN' || role === 'PARTNER';
  }

  private getDisplayName(firstName?: string | null, lastName?: string | null): string {
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    return fullName || 'Team member';
  }

  private async ensureFeedbackTable() {
    if (this.tableReady) return;
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FeedbackSubmission" (
        "id" TEXT PRIMARY KEY,
        "formType" TEXT NOT NULL DEFAULT 'DASHBOARD_FEEDBACK',
        "problem" TEXT NULL,
        "description" TEXT NOT NULL,
        "urgency" TEXT NULL,
        "contactName" TEXT NULL,
        "contactEmail" TEXT NULL,
        "submitterId" TEXT NULL,
        "submitterEmail" TEXT NULL,
        "submitterName" TEXT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "FeedbackSubmission"
      ADD COLUMN IF NOT EXISTS "formType" TEXT NOT NULL DEFAULT 'DASHBOARD_FEEDBACK';
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "FeedbackSubmission"
      ADD COLUMN IF NOT EXISTS "urgency" TEXT NULL;
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "FeedbackSubmission"
      ADD COLUMN IF NOT EXISTS "contactName" TEXT NULL;
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "FeedbackSubmission"
      ADD COLUMN IF NOT EXISTS "contactEmail" TEXT NULL;
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "FeedbackSubmission"
      ALTER COLUMN "problem" DROP NOT NULL;
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "FeedbackSubmission"
      ALTER COLUMN "submitterEmail" DROP NOT NULL;
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "FeedbackSubmission"
      ALTER COLUMN "submitterName" DROP NOT NULL;
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "FeedbackSubmission_createdAt_idx"
      ON "FeedbackSubmission" ("createdAt");
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "FeedbackSubmission_formType_createdAt_idx"
      ON "FeedbackSubmission" ("formType", "createdAt");
    `);
    this.tableReady = true;
  }

  async createFormSubmission(user: any, formType: FormType, body: FormSubmissionInput) {
    await this.ensureFeedbackTable();

    const description = body?.description?.trim();
    const rawProblem = body?.problem?.trim();
    const rawUrgency = body?.urgency?.trim();
    const contactName = body?.contactName?.trim() || null;
    const contactEmail = body?.contactEmail?.trim().toLowerCase() || null;

    if (!description) {
      throw new BadRequestException('Description is required');
    }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new BadRequestException('Valid contact email is required');
    }

    let problem: string | null = rawProblem || null;
    let urgency: Urgency | null = null;
    let submitterId: string | null = user?.id ?? null;
    let submitterEmail: string | null = String(user?.email ?? '').toLowerCase() || null;
    let submitterName: string | null = this.getDisplayName(user?.firstName, user?.lastName);

    if (formType === 'DASHBOARD_FEEDBACK') {
      if (!problem) {
        throw new BadRequestException('Problem is required');
      }
    }

    if (formType === 'ANONYMOUS_FEEDBACK') {
      if (!rawUrgency || !URGENCY_VALUES.includes(rawUrgency as Urgency)) {
        throw new BadRequestException('Urgency is required');
      }
      urgency = rawUrgency as Urgency;
      problem = null;
      submitterId = null;
      submitterEmail = null;
      submitterName = null;
    }

    if (formType === 'PRC') {
      problem = null;
      submitterId = null;
      submitterEmail = null;
      submitterName = null;
    }

    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "FeedbackSubmission"
      ("id", "formType", "problem", "description", "urgency", "contactName", "contactEmail", "submitterId", "submitterEmail", "submitterName", "createdAt", "updatedAt")
      VALUES
      (${id}, ${formType}, ${problem}, ${description}, ${urgency}, ${contactName}, ${contactEmail}, ${submitterId}, ${submitterEmail}, ${submitterName}, NOW(), NOW())
    `;

    const inserted = await this.prisma.$queryRaw<any[]>`
      SELECT
        "id",
        "formType",
        "problem",
        "description",
        "urgency",
        "contactName",
        "contactEmail",
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

  async listFormSubmissions(formType: FormType) {
    await this.ensureFeedbackTable();
    return this.prisma.$queryRaw<any[]>`
      SELECT
        "id",
        "formType",
        "problem",
        "description",
        "urgency",
        "contactName",
        "contactEmail",
        "submitterId",
        "submitterEmail",
        "submitterName",
        "createdAt",
        "updatedAt"
      FROM "FeedbackSubmission"
      WHERE "formType" = ${formType}
      ORDER BY "createdAt" DESC
    `;
  }
}
