import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduledReminderStatus } from '@prisma/client';
import {
  NotificationJob,
  NotificationsService,
} from '../notifications/notifications.service';

import {
  resolveReminderConfig,
  type ResolvedReminderConfig,
} from './reminder-config';
/** Reminder offsets (minutes before deadline) offered as presets. */
export const REMINDER_OFFSET_PRESETS = [
  { minutes: 10080, label: '1 week before' },
  { minutes: 1440, label: '24 hours before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 60, label: '1 hour before' },
];
const MAX_OFFSETS = 5;
const MAX_OFFSET_MINUTES = 20160; // 2 weeks

@Injectable()
export class DeadlineRemindersService {
  private readonly logger = new Logger(DeadlineRemindersService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
  ) {}

  /** List the preset offsets the config UI offers. */
  getOffsetPresets() {
    return REMINDER_OFFSET_PRESETS;
  }

  /**
   * Resolve the effective reminder config for a project: stored settings if
   * present, otherwise safe defaults (disabled, 24h + 1h, project timezone).
   */
  async getConfig(projectId: string): Promise<ResolvedReminderConfig> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { sprintTimezone: true },
    });
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const stored = await this.prisma.reminderConfig.findUnique({
      where: { projectId },
    });
    return resolveReminderConfig({
      ...stored,
      timezone: project.sprintTimezone,
    });
  }

  /**
   * Persist project reminder settings (create or update) and reschedule (or
   * cancel) reminders across the project's not-yet-final deliverables.
   */
  async updateConfig(
    projectId: string,
    input: { enabled: boolean; offsetsMinutes: number[] },
  ): Promise<ResolvedReminderConfig> {
    if (typeof input.enabled !== 'boolean')
      throw new BadRequestException('enabled must be a boolean');
    if (!Array.isArray(input.offsetsMinutes))
      throw new BadRequestException('offsetsMinutes must be an array');
    const offsets =
      input.enabled || input.offsetsMinutes?.length
        ? this.validateOffsets(input.offsetsMinutes)
        : [];

    await this.prisma.reminderConfig.upsert({
      where: { projectId },
      create: { projectId, enabled: input.enabled, offsetsMinutes: offsets },
      update: { enabled: input.enabled, offsetsMinutes: offsets },
    });

    const deliverables = await this.prisma.deliverable.findMany({
      where: {
        projectId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
      },
      select: { id: true },
    });

    for (const d of deliverables) await this.rescheduleDeliverable(d.id);

    return this.getConfig(projectId);
  }

  /**
   * Preview who will receive reminders for a project: active assignees of each
   * pending deliverable, with Slack connection status. Shown in the config UI.
   */
  async getRecipientPreview(projectId: string) {
    const deliverables = await this.prisma.deliverable.findMany({
      where: {
        projectId,
        completed: false,
        status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
      },
      include: { assignments: true, reminderOverride: true },
      orderBy: { deadline: 'asc' },
    });
    const [eligible, config] = await Promise.all([
      this.getEligibleRecipients(projectId),
      this.getConfig(projectId),
    ]);
    return deliverables.map((d) => {
      const ids = d.reminderOverride?.explicitRecipientUserIds.length
        ? d.reminderOverride.explicitRecipientUserIds
        : d.assignments.map((a) => a.userId);
      return {
        deliverableId: d.id,
        title: d.title,
        deadline: d.deadline,
        unassigned: !eligible.some((user) => ids.includes(user.userId)),
        recipients:
          (d.reminderOverride?.enabled ?? config.enabled)
            ? eligible.filter((user) => ids.includes(user.userId))
            : [],
      };
    });
  }

  private async getEligibleRecipients(projectId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        active: true,
        projectAssignments: { some: { projectId, leftAt: null } },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        slackConnections: { select: { id: true } },
      },
    });
    return users.map((user) => ({
      userId: user.id,
      email: user.email,
      name:
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        'Team member',
      slackConnected: user.slackConnections.length > 0,
    }));
  }

  async getDeliverableReminderSettings(deliverableId: string) {
    const d = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      select: { projectId: true, reminderOverride: true },
    });
    if (!d) throw new BadRequestException('Deliverable not found');
    const [config, eligibleRecipients] = await Promise.all([
      this.getConfig(d.projectId),
      this.getEligibleRecipients(d.projectId),
    ]);
    return {
      ...resolveReminderConfig(config, d.reminderOverride),
      override: d.reminderOverride,
      eligibleRecipients,
    };
  }

  /**
   * Schedule reminders for a deliverable from the resolved project config.
   * Idempotent: one ScheduledReminder row per (deliverable, user, offset),
   * deduped by a deterministic BullMQ jobId. Only active assignees who still
   * belong to the project are notified; an unassigned deliverable produces no
   * reminders (never a silent team broadcast).
   */
  async rescheduleDeliverable(deliverableId: string): Promise<void> {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      select: {
        id: true,
        title: true,
        deadline: true,
        status: true,
        completed: true,
        projectId: true,
        project: { select: { name: true, sprintTimezone: true } },
        assignments: { select: { userId: true } },
        reminderOverride: true,
      },
    });

    if (!deliverable) {
      return;
    }

    // Never remind on finalized deliverables.
    if (
      deliverable.completed ||
      ['SUBMITTED', 'APPROVED'].includes(deliverable.status)
    ) {
      await this.cancelRemindersForDeliverable(
        deliverableId,
        'Deliverable finalized',
      );
      return;
    }

    const config = resolveReminderConfig(
      await this.getConfig(deliverable.projectId),
      deliverable.reminderOverride,
    );
    if (!config.enabled) {
      await this.cancelRemindersForDeliverable(
        deliverableId,
        'Reminders disabled by deliverable override',
      );
      return;
    }

    const recipientUserIds = deliverable.reminderOverride
      ?.explicitRecipientUserIds?.length
      ? deliverable.reminderOverride.explicitRecipientUserIds
      : deliverable.assignments.map(({ userId }) => userId);
    const recipients = recipientUserIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: recipientUserIds },
            active: true,
            projectAssignments: {
              some: { projectId: deliverable.projectId, leftAt: null },
            },
          },
          select: { id: true },
        })
      : [];
    const now = Date.now();
    const desired = recipients.flatMap((recipient) =>
      config.offsetsMinutes.map((offsetMinutes) => ({
        userId: recipient.id,
        offsetMinutes,
        fireAt: new Date(
          deliverable.deadline.getTime() - offsetMinutes * 60000,
        ),
        jobId: this.buildJobId(
          deliverableId,
          recipient.id,
          offsetMinutes,
          deliverable.deadline,
          config.timezone,
        ),
      })),
    );
    const existing = await this.prisma.scheduledReminder.findMany({
      where: { deliverableId },
    });
    const wanted = new Set(desired.map((item) => item.jobId));
    // Invalidate database state before removing jobs. A worker already holding an
    // obsolete job must fail its pre-send check even if queue removal loses a race.
    await this.cancelRows(
      existing.filter(
        (row) => row.status === 'PENDING' && !wanted.has(row.jobId),
      ),
      'Schedule or recipients changed',
    );
    const queue = this.notificationsService.getNotificationQueue();
    for (const item of desired) {
      // Keep already-due jobs eligible for delivery and retries without creating
      // new reminders retroactively when an offset is enabled after its fire time.
      if (item.fireAt.getTime() <= now) continue;
      const previous = existing.find(
        (row) =>
          row.userId === item.userId &&
          row.offsetMinutes === item.offsetMinutes,
      );
      if (
        previous?.jobId === item.jobId &&
        (previous.status === 'SENT' || previous.status === 'FAILED')
      )
        continue;
      const reminder = await this.prisma.scheduledReminder.upsert({
        where: {
          deliverableId_userId_offsetMinutes: {
            deliverableId,
            userId: item.userId,
            offsetMinutes: item.offsetMinutes,
          },
        },
        create: { deliverableId, ...item, status: 'PENDING' },
        update: {
          ...item,
          status: 'PENDING',
          ...(previous?.jobId !== item.jobId || previous?.status !== 'PENDING'
            ? { attempts: 0, lastError: null, sentAt: null, cancelledAt: null }
            : {}),
        },
      });
      try {
        if (!queue)
          throw new Error('Redis unavailable: reminder was not queued');
        // Cancelled jobs may still exist if removal raced with a worker. Remove
        // completed/failed copies before explicitly re-enabling the same schedule.
        const oldJob = await queue.getJob(item.jobId);
        if (oldJob && ['completed', 'failed'].includes(await oldJob.getState()))
          await oldJob.remove();
        await queue.add(
          'send-notification',
          {
            userId: item.userId,
            type: 'DEADLINE_REMINDER',
            channel: 'BOTH',
            scheduledReminderId: reminder.id,
            data: {
              deliverableTitle: deliverable.title,
              projectName: deliverable.project.name,
              deadline: deliverable.deadline,
              offsetMinutes: item.offsetMinutes,
              hoursRemaining: item.offsetMinutes / 60,
              remainingMinutes: item.offsetMinutes,
              timezone: config.timezone,
              deepLink: this.buildDeepLink(
                deliverableId,
                deliverable.projectId,
              ),
            },
          } satisfies NotificationJob,
          {
            delay: Math.max(0, item.fireAt.getTime() - Date.now()),
            jobId: item.jobId,
          },
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.scheduledReminder.updateMany({
          where: { id: reminder.id, jobId: item.jobId, status: 'PENDING' },
          data: { status: 'FAILED', lastError: message },
        });
        this.logger.warn(message);
      }
    }
  }

  private async cancelRows(
    rows: { id: string; jobId: string }[],
    reason: string,
  ): Promise<void> {
    const queue = this.notificationsService.getNotificationQueue();
    for (const row of rows) {
      await this.prisma.scheduledReminder.updateMany({
        where: { id: row.id, jobId: row.jobId, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (!queue) continue;
      try {
        await (await queue.getJob(row.jobId))?.remove();
      } catch (error: unknown) {
        this.logger.warn(
          'Could not remove cancelled reminder job: ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }
    if (rows.length)
      this.logger.log('Cancelled ' + rows.length + ' reminder(s): ' + reason);
  }

  /**
   * Cancel all pending reminders for a deliverable and remove their queued jobs.
   * Already-sent reminders are left untouched (historical record).
   */
  async cancelRemindersForDeliverable(
    deliverableId: string,
    reason: string,
  ): Promise<void> {
    const pending = await this.prisma.scheduledReminder.findMany({
      where: { deliverableId, status: 'PENDING' },
      select: { id: true, jobId: true },
    });

    if (pending.length === 0) {
      return;
    }

    await this.cancelRows(pending, reason);
  }

  /** Project-scoped reminder status view for authorized managers. */
  async getProjectReminderStatus(
    projectId: string,
    status?: ScheduledReminderStatus,
  ) {
    if (status && !Object.values(ScheduledReminderStatus).includes(status))
      throw new BadRequestException('Invalid reminder status');
    return this.prisma.scheduledReminder.findMany({
      where: status
        ? { deliverable: { projectId }, status }
        : { deliverable: { projectId } },
      select: {
        id: true,
        offsetMinutes: true,
        fireAt: true,
        status: true,
        attempts: true,
        lastError: true,
        sentAt: true,
        cancelledAt: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        deliverable: { select: { id: true, title: true, deadline: true } },
      },
      orderBy: { fireAt: 'asc' },
    });
  }

  /**
   * Upsert a deliverable-level reminder override. Null fields mean inherit.
   * After saving, reschedule the deliverable so the new config takes effect.
   */
  async updateDeliverableReminderConfig(
    deliverableId: string,
    input: {
      enabled?: boolean | null;
      offsetMinutes?: number[];
      explicitRecipientUserIds?: string[];
    },
  ) {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      select: { id: true, projectId: true },
    });
    if (!deliverable) {
      throw new BadRequestException('Deliverable not found');
    }

    if (input.enabled != null && typeof input.enabled !== 'boolean')
      throw new BadRequestException('enabled must be a boolean');
    const offsets = input.offsetMinutes?.length
      ? this.validateOffsets(input.offsetMinutes)
      : [];
    if (
      input.offsetMinutes !== undefined &&
      !Array.isArray(input.offsetMinutes)
    )
      throw new BadRequestException('offsetMinutes must be an array');
    const ids = input.explicitRecipientUserIds ?? [];
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
      throw new BadRequestException('Invalid recipient IDs');
    if (ids.length) {
      const eligible = await this.prisma.user.findMany({
        where: {
          id: { in: ids },
          active: true,
          projectAssignments: {
            some: { projectId: deliverable.projectId, leftAt: null },
          },
        },
        select: { id: true },
      });
      if (new Set(ids).size !== eligible.length)
        throw new BadRequestException(
          'Recipients must be active project members',
        );
    }

    const data = {
      enabled: input.enabled ?? null,
      offsetMinutes: offsets,
      explicitRecipientUserIds: ids,
    };
    await this.prisma.deliverableReminderOverride.upsert({
      where: { deliverableId },
      create: { deliverableId, ...data },
      update: data,
    });
    await this.rescheduleDeliverable(deliverableId);
    return this.getDeliverableReminderSettings(deliverableId);
  }

  private validateOffsets(offsets: number[]): number[] {
    if (!Array.isArray(offsets) || offsets.length === 0) {
      throw new BadRequestException('At least one reminder offset is required');
    }
    if (offsets.length > MAX_OFFSETS) {
      throw new BadRequestException(
        `At most ${MAX_OFFSETS} reminder offsets are allowed`,
      );
    }
    const normalized = new Set<number>();
    for (const minutes of offsets) {
      if (!Number.isInteger(minutes) || minutes <= 0) {
        throw new BadRequestException(
          'Reminder offsets must be positive whole minutes',
        );
      }
      if (minutes > MAX_OFFSET_MINUTES) {
        throw new BadRequestException(
          `Reminder offsets cannot exceed ${MAX_OFFSET_MINUTES} minutes`,
        );
      }
      normalized.add(minutes);
    }
    return Array.from(normalized).sort((a, b) => b - a);
  }

  private buildJobId(
    deliverableId: string,
    userId: string,
    offsetMinutes: number,
    deadline: Date,
    timezone: string,
  ): string {
    const version = createHash('sha256')
      .update(deadline.toISOString() + timezone)
      .digest('hex')
      .slice(0, 16);
    return `reminder-${deliverableId}-${userId}-${offsetMinutes}-${version}`;
  }

  private buildDeepLink(deliverableId: string, projectId: string): string {
    const base =
      this.configService.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/deliverables?projectId=${projectId}&deliverableId=${deliverableId}`;
  }
}
