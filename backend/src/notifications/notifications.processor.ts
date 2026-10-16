import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SlackService } from '../integrations/slack.service';
import { createRedisConnection } from '../common/redis.config';
import { NotificationJob } from './notifications.service';

// Bounded Slack retry for scheduled reminders (matches the queue's attempts).
const REMINDER_MAX_ATTEMPTS = 3;

@Injectable()
export class NotificationsProcessor implements OnModuleInit {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
    private configService: ConfigService,
  ) {}

  private getDisplayName(firstName?: string | null, lastName?: string | null, email?: string | null): string {
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    return fullName || 'Team member';
  }

  onModuleInit() {
    const connection = createRedisConnection(this.configService);

    if (!connection) {
      this.logger.warn('Redis not available, notification worker will not start');
      return;
    }

    try {
      this.worker = new Worker(
        'notifications',
        async (job: Job<NotificationJob>) => {
          return this.processNotification(job);
        },
        {
          connection,
          concurrency: 5,
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`Job ${job.id} completed successfully`);
      });

      this.worker.on('failed', (job, error) => {
        this.logger.error(`Job ${job?.id} failed:`, error);
      });

      this.logger.log('Notification worker started');
    } catch (error) {
      this.logger.warn(`Failed to start notification worker: ${error.message}`);
    }
  }

  private async processNotification(job: Job<NotificationJob>): Promise<void> {
    const { userId, type, channel, data, scheduledReminderId } = job.data;

    this.logger.log(`Processing notification for user ${userId}, type: ${type}`);

    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // For scheduled reminders, recheck eligibility so deadline/assignment changes
    // and extensions don't produce stale reminders. If the reminder is no longer
    // valid (cancelled, already sent, or deliverable finalized), skip sending.
    if (scheduledReminderId) {
      const stillValid = await this.reminderStillValid(scheduledReminderId);
      if (!stillValid) {
        this.logger.log(`Skipping reminder ${scheduledReminderId}: no longer valid`);
        return;
      }
    }

    const userName = this.getDisplayName(user.firstName, user.lastName, user.email);

    let slackSuccess = true;
    let slackError: string | undefined;

    // Send based on channel preference
    if (channel === 'SLACK' || channel === 'BOTH' || channel === 'EMAIL') {
      try {
        slackSuccess = await this.sendSlackNotification(type, user.id, userName, data);
      } catch (error: any) {
        slackSuccess = false;
        slackError = error?.message ?? String(error);
      }
    }

    if (scheduledReminderId) {
      if (slackSuccess) {
        // Delivered: create the in-app record and mark the reminder SENT.
        await this.prisma.notification.create({
          data: {
            userId,
            type: type as any,
            channel,
            title: this.buildNotificationTitle(type, data),
            message: this.buildNotificationMessage(type, data),
            status: 'SENT',
            sentAt: new Date(),
            metadata: { ...(data as any), scheduledReminderId },
          },
        });
        await this.prisma.scheduledReminder.updateMany({
          where: { id: scheduledReminderId, status: 'PENDING' },
          data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
        });
        return;
      }

      // Slack failed. Retry transient failures via BullMQ up to the bounded
      // attempt limit; do not create the in-app record until we stop retrying
      // (avoids duplicates on each retry).
      await this.prisma.scheduledReminder.updateMany({
        where: { id: scheduledReminderId, status: 'PENDING' },
        data: { attempts: { increment: 1 }, lastError: slackError ?? 'Slack delivery failed' },
      });

      const attemptsMade = job.attemptsMade ?? 1;
      if (attemptsMade < REMINDER_MAX_ATTEMPTS) {
        // Let BullMQ re-run this job with its exponential backoff.
        throw new Error(slackError ?? 'Slack delivery failed');
      }

      // Final attempt failed: preserve the in-app notification (marked FAILED)
      // and record the terminal failure state for the manager status view.
      await this.prisma.notification.create({
        data: {
          userId,
          type: type as any,
          channel,
          title: this.buildNotificationTitle(type, data),
          message: this.buildNotificationMessage(type, data),
          status: 'FAILED',
          sentAt: new Date(),
          metadata: {
            ...(data as any),
            slackError: slackError ?? 'Slack delivery failed',
            scheduledReminderId,
          },
        },
      });
      await this.prisma.scheduledReminder.updateMany({
        where: { id: scheduledReminderId, status: 'PENDING' },
        data: { status: 'FAILED', lastError: slackError ?? 'Slack delivery failed' },
      });
    } else {
      // Non-reminder notifications were pre-created as PENDING by
      // queueNotification; flip them to their final state.
      await this.prisma.notification.updateMany({
        where: { userId, type, status: 'PENDING' },
        data: {
          status: slackSuccess ? 'SENT' : 'FAILED',
          sentAt: new Date(),
        },
      });
    }
  }

  /**
   * A scheduled reminder is still valid if its row is PENDING and the underlying
   * deliverable has not been finalized (submitted/approved). This prevents stale
   * reminders after extensions or assignment changes.
   */
  private async reminderStillValid(scheduledReminderId: string): Promise<boolean> {
    const reminder = await this.prisma.scheduledReminder.findUnique({
      where: { id: scheduledReminderId },
      select: {
        status: true,
        deliverable: { select: { status: true } },
      },
    });
    if (!reminder || reminder.status !== 'PENDING') {
      return false;
    }
    if (['SUBMITTED', 'APPROVED'].includes(reminder.deliverable.status)) {
      return false;
    }
    return true;
  }

  private buildNotificationTitle(type: string, data: any): string {
    switch (type) {
      case 'DEADLINE_1H':
        return 'Deadline in 1 hour';
      case 'DEADLINE_24H':
        return 'Deadline in 24 hours';
      case 'DEADLINE_REMINDER':
        return 'Upcoming deadline reminder';
      default:
        return (data?.deliverableTitle as string) || 'Notification';
    }
  }

  private buildNotificationMessage(type: string, data: any): string {
    const parts: string[] = [];
    if (data?.deliverableTitle) parts.push(`${data.deliverableTitle}`);
    if (data?.projectName) parts.push(`Project: ${data.projectName}`);
    if (data?.deadline) parts.push(`Due: ${new Date(data.deadline).toISOString()}`);
    if (typeof data?.remainingMinutes === 'number') {
      parts.push(`Reminder ${data.remainingMinutes} minutes before deadline`);
    }
    return parts.join(' · ') || 'You have a new notification.';
  }


  private async sendSlackNotification(
    type: string,
    userId: string,
    userName: string,
    data: any,
  ): Promise<boolean> {
    try {
      switch (type) {
        case 'DEADLINE_1H':
        case 'DEADLINE_24H':
        case 'DEADLINE_REMINDER':
          return await this.slackService.sendDeadlineReminder(
            userId,
            data.deliverableTitle,
            data.projectName,
            data.deadline,
            userName,
            data.hoursRemaining,
            {
              deepLink: data.deepLink,
              timezone: data.timezone,
              remainingMinutes: data.remainingMinutes,
            },
          );

        case 'EXTENSION_REQUEST':
          return await this.slackService.sendExtensionRequest(
            userId,
            data.deliverableTitle,
            data.projectName,
            userName,
            data.reason,
            data.requestedDate,
          );

        case 'EXTENSION_APPROVED':
          return await this.slackService.sendExtensionApproved(
            userId,
            data.deliverableTitle,
            userName,
            data.newDeadline,
          );

        case 'EXTENSION_DENIED':
          return await this.slackService.sendExtensionDenied(
            userId,
            data.deliverableTitle,
            userName,
            data.reason,
          );

        case 'SUBMISSION_APPROVED':
          return await this.slackService.sendSubmissionApproved(
            userId,
            data.deliverableTitle,
            userName,
            data.feedback,
          );

        case 'SUBMISSION_REJECTED':
          return await this.slackService.sendSubmissionRejected(
            userId,
            data.deliverableTitle,
            userName,
            data.feedback,
          );

        case 'PROJECT_UPDATED':
          return await this.slackService.sendDirectMessageToUser(userId, {
            text: this.buildProjectUpdateSlackMessage(data),
          });

        default:
          this.logger.warn(`Unknown notification type: ${type}`);
          return false;
      }
    } catch (error) {
      this.logger.error(`Slack notification failed:`, error);
      return false;
    }
  }

  private buildProjectUpdateSlackMessage(data: any): string {
    const projectName = data?.projectName ? `Project: ${data.projectName}. ` : '';
    const deliverableTitle = data?.deliverableTitle
      ? `Assignment: ${data.deliverableTitle}. `
      : '';
    const feedback = data?.feedback ? String(data.feedback) : 'A project update is available.';
    return `${projectName}${deliverableTitle}${feedback}`.trim();
  }
}
