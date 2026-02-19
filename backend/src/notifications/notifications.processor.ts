import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SlackService } from '../integrations/slack.service';
import { createRedisConnection } from '../common/redis.config';
import { NotificationJob } from './notifications.service';

@Injectable()
export class NotificationsProcessor implements OnModuleInit {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
    private configService: ConfigService,
  ) {}

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
    const { userId, type, channel, data } = job.data;

    this.logger.log(`Processing notification for user ${userId}, type: ${type}`);

    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

    let slackSuccess = true;

    // Send based on channel preference
    if (channel === 'SLACK' || channel === 'BOTH' || channel === 'EMAIL') {
      slackSuccess = await this.sendSlackNotification(
        type,
        user.id,
        userName,
        data,
      );
    }

    // Update notification status in database
    const status = slackSuccess ? 'SENT' : 'FAILED';

    await this.prisma.notification.updateMany({
      where: {
        userId,
        type,
        status: 'PENDING',
      },
      data: {
        status,
        sentAt: new Date(),
      },
    });
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
