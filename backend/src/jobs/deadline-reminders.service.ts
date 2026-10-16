import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduledReminderStatus } from '@prisma/client';
import { NotificationJob, NotificationsService } from '../notifications/notifications.service';

const DEFAULT_TIMEZONE = 'America/Chicago';
/** Reminder offsets (minutes before deadline) offered as presets. */
export const REMINDER_OFFSET_PRESETS = [
  { minutes: 10080, label: '1 week before' },
  { minutes: 1440, label: '24 hours before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 60, label: '1 hour before' },
];
const MAX_OFFSETS = 5;
const MAX_OFFSET_MINUTES = 20160; // 2 weeks

export interface ResolvedReminderConfig {
  enabled: boolean;
  offsetsMinutes: number[];
  timezone: string;
}

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
    const timezone = project.sprintTimezone || DEFAULT_TIMEZONE;

    const stored = await this.prisma.reminderConfig.findUnique({
      where: { projectId },
    });
    if (!stored) {
      return { enabled: false, offsetsMinutes: [1440, 60], timezone };
    }
    return {
      enabled: stored.enabled,
      offsetsMinutes: stored.offsetsMinutes ?? [1440, 60],
      timezone,
    };
  }

  /**
   * Persist project reminder settings (create or update) and reschedule (or
   * cancel) reminders across the project's not-yet-final deliverables.
   */
  async updateConfig(
    projectId: string,
    input: { enabled: boolean; offsetsMinutes: number[] },
  ): Promise<ResolvedReminderConfig> {
    const offsets = this.validateOffsets(input.offsetsMinutes);

    await this.prisma.reminderConfig.upsert({
      where: { projectId },
      create: { projectId, enabled: input.enabled, offsetsMinutes: offsets },
      update: { enabled: input.enabled, offsetsMinutes: offsets },
    });

    const deliverables = await this.prisma.deliverable.findMany({
      where: { projectId, status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] } },
      select: { id: true },
    });

    if (!input.enabled) {
      for (const d of deliverables) {
        await this.cancelRemindersForDeliverable(d.id, 'Reminders disabled');
      }
    } else {
      for (const d of deliverables) {
        await this.rescheduleDeliverable(d.id);
      }
    }

    return this.getConfig(projectId);
  }

  /**
   * Preview who will receive reminders for a project: active assignees of each
   * pending deliverable, with Slack connection status. Shown in the config UI.
   */
  async getRecipientPreview(projectId: string) {
    const deliverables = await this.prisma.deliverable.findMany({
      where: { projectId, status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] } },
      select: {
        id: true,
        title: true,
        deadline: true,
        assignments: {
          select: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                active: true,
                slackConnections: { select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: { deadline: 'asc' },
    });

    return deliverables.map((d) => ({
      deliverableId: d.id,
      title: d.title,
      deadline: d.deadline,
      unassigned: d.assignments.length === 0,
      recipients: d.assignments
        .filter((a) => a.user.active)
        .map((a) => ({
          userId: a.user.id,
          email: a.user.email,
          name: `${a.user.firstName || ''} ${a.user.lastName || ''}`.trim() || 'Team member',
          slackConnected: a.user.slackConnections.length > 0,
        })),
    }));
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
    if (['SUBMITTED', 'APPROVED'].includes(deliverable.status)) {
      await this.cancelRemindersForDeliverable(deliverableId, 'Deliverable finalized');
      return;
    }

    const config = await this.getDeliverableReminderConfig(deliverableId);
    if (!config.enabled) {
      await this.cancelRemindersForDeliverable(deliverableId, 'Reminders disabled by deliverable override');
      return;
    }

    // Resolve recipient set: explicit override users, else active assignees.
    let recipientUserIds: string[];
    if (
      deliverable.reminderOverride?.explicitRecipientUserIds?.length
    ) {
      recipientUserIds = [...deliverable.reminderOverride.explicitRecipientUserIds];
    } else {
      recipientUserIds = deliverable.assignments.map((a) => a.userId).filter(Boolean);
    }

    const activeRecipients =
      recipientUserIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: {
              id: { in: recipientUserIds },
              active: true,
              projectAssignments: { some: { projectId: deliverable.projectId } },
            },
            select: { id: true },
          });

    if (activeRecipients.length === 0) {
      // No explicit eligible recipients: do not silently notify the whole team.
      await this.cancelRemindersForDeliverable(deliverableId, 'No active recipients');
      return;
    }

    const timezone = config.timezone || DEFAULT_TIMEZONE;
    const deadline = deliverable.deadline;
    const deepLink = this.buildDeepLink(deliverableId, deliverable.projectId);
    const queue = this.notificationsService.getNotificationQueue();

    for (const recipient of activeRecipients) {
      for (const offsetMinutes of config.offsetsMinutes) {
        const fireAt = new Date(deadline.getTime() - offsetMinutes * 60 * 1000);
        // Skip reminders whose fire time already passed (no stale sends).
        if (fireAt.getTime() <= Date.now()) {
          continue;
        }

        const jobId = this.buildJobId(deliverableId, recipient.id, offsetMinutes);
        const delay = Math.max(0, fireAt.getTime() - Date.now());

        const reminder = await this.prisma.scheduledReminder.upsert({
          where: {
            deliverableId_userId_offsetMinutes: {
              deliverableId,
              userId: recipient.id,
              offsetMinutes,
            },
          },
          create: {
            deliverableId,
            userId: recipient.id,
            offsetMinutes,
            fireAt,
            status: 'PENDING',
            jobId,
          },
          update: {
            fireAt,
            // Re-arm a cancelled/failed reminder on reschedule; the unique key
            // plus BullMQ jobId keep repeated scans from duplicating.
            status: 'PENDING',
            jobId,
            lastError: null,
          },
        });

        if (queue) {
          try {
            await queue.add(
              'send-notification',
              {
                userId: recipient.id,
                type: offsetMinutes >= 720 ? 'DEADLINE_24H' : 'DEADLINE_1H',
                channel: 'BOTH',
                scheduledReminderId: reminder.id,
                data: {
                  deliverableTitle: deliverable.title,
                  projectName: deliverable.project.name,
                  deadline,
                  offsetMinutes,
                  hoursRemaining: offsetMinutes / 60,
                  remainingMinutes: offsetMinutes,
                  deepLink,
                  timezone,
                },
              } as NotificationJob,
              { delay, jobId },
            );
          } catch (error: any) {
            this.logger.warn(`Failed to enqueue reminder ${jobId}: ${error?.message ?? error}`);
          }
        } else {
          this.logger.warn(
            'Redis unavailable: reminder rows created but not enqueued for background delivery',
          );
        }
      }
    }
  }

  /**
   * Cancel all pending reminders for a deliverable and remove their queued jobs.
   * Already-sent reminders are left untouched (historical record).
   */
  async cancelRemindersForDeliverable(deliverableId: string, reason: string): Promise<void> {
    const pending = await this.prisma.scheduledReminder.findMany({
      where: { deliverableId, status: 'PENDING' },
      select: { id: true, jobId: true },
    });

    if (pending.length === 0) {
      return;
    }

    const queue = this.notificationsService.getNotificationQueue();
    if (queue) {
      for (const reminder of pending) {
        try {
          const job = await queue.getJob(reminder.jobId);
          if (job) {
            await job.remove();
          }
        } catch (error: any) {
          this.logger.warn(`Failed to remove queued job ${reminder.jobId}: ${error?.message ?? error}`);
        }
      }
    }

    await this.prisma.scheduledReminder.updateMany({
      where: { deliverableId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    this.logger.log(
      `Cancelled ${pending.length} reminder(s) for deliverable ${deliverableId}: ${reason}`,
    );
  }

  /** Project-scoped reminder status view for authorized managers. */
  async getProjectReminderStatus(
    projectId: string,
    status?: ScheduledReminderStatus,
  ) {
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
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        deliverable: { select: { id: true, title: true, deadline: true } },
      },
      orderBy: { fireAt: 'asc' },
    });
  }

  /**
   * Resolve the effective reminder config for a specific deliverable:
   * deliverable-level override if present, otherwise project defaults.
   * Null override fields mean "inherit from project".
   */
  async getDeliverableReminderConfig(deliverableId: string): Promise<ResolvedReminderConfig> {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      select: {
        projectId: true,
        reminderOverride: true,
      },
    });

    if (!deliverable) {
      throw new BadRequestException('Deliverable not found');
    }

    const projectConfig = await this.getConfig(deliverable.projectId);

    // Inherit everything from project unless override specifies otherwise.
    const enabled = deliverable.reminderOverride?.enabled ?? projectConfig.enabled;
    const overrideOffsets = deliverable.reminderOverride?.offsetMinutes;
    const offsetsMinutes =
      overrideOffsets?.length > 0 ? overrideOffsets : projectConfig.offsetsMinutes;

    return {
      enabled,
      offsetsMinutes,
      timezone: projectConfig.timezone,
    };
  }

  /**
   * Upsert a deliverable-level reminder override. Null fields mean inherit.
   * After saving, reschedule the deliverable so the new config takes effect.
   */
  async updateDeliverableReminderConfig(
    deliverableId: string,
    input: {
      enabled?: boolean;
      offsetMinutes?: number[];
      explicitRecipientUserIds?: string[];
    },
  ): Promise<ResolvedReminderConfig> {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      select: { id: true, projectId: true },
    });
    if (!deliverable) {
      throw new BadRequestException('Deliverable not found');
    }

    const offsets = input.offsetMinutes
      ? this.validateOffsets(input.offsetMinutes)
      : undefined;

    await this.prisma.deliverableReminderOverride.upsert({
      where: { deliverableId },
      create: {
        deliverableId,
        enabled: input.enabled ?? null,
        offsetMinutes: offsets ?? [],
        explicitRecipientUserIds: input.explicitRecipientUserIds ?? [],
      },
      update: {
        enabled: input.enabled !== undefined ? input.enabled : null,
        offsetMinutes: offsets ?? [],
        explicitRecipientUserIds:
          input.explicitRecipientUserIds !== undefined
            ? input.explicitRecipientUserIds
            : [],
      },
    });

    await this.rescheduleDeliverable(deliverableId);
    return this.getDeliverableReminderConfig(deliverableId);
  }

  private validateOffsets(offsets: number[]): number[] {
    if (!Array.isArray(offsets) || offsets.length === 0) {
      throw new BadRequestException('At least one reminder offset is required');
    }
    if (offsets.length > MAX_OFFSETS) {
      throw new BadRequestException(`At most ${MAX_OFFSETS} reminder offsets are allowed`);
    }
    const normalized = new Set<number>();
    for (const value of offsets) {
      const minutes = Number(value);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        throw new BadRequestException('Reminder offsets must be positive whole minutes');
      }
      if (minutes > MAX_OFFSET_MINUTES) {
        throw new BadRequestException(`Reminder offsets cannot exceed ${MAX_OFFSET_MINUTES} minutes`);
      }
      normalized.add(minutes);
    }
    return Array.from(normalized).sort((a, b) => b - a);
  }

  private buildJobId(deliverableId: string, userId: string, offsetMinutes: number): string {
    return `reminder-${deliverableId}-${userId}-${offsetMinutes}`;
  }

  private buildDeepLink(deliverableId: string, projectId: string): string {
    const base =
      this.configService.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/deliverables?projectId=${projectId}&deliverableId=${deliverableId}`;
  }
}
