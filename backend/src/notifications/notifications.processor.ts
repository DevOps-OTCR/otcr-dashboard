import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SlackService } from '../integrations/slack.service';
import { EmailService } from '../integrations/email.service';
import { createRedisConnection } from '../common/redis.config';
import { NotificationJob } from './notifications.service';

@Injectable()
export class NotificationsProcessor implements OnModuleInit {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private worker: Worker;

  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    const connection = createRedisConnection(this.configService);

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
    let emailSuccess = true;

    // Send based on channel preference
    if (channel === 'SLACK' || channel === 'BOTH') {
      slackSuccess = await this.sendSlackNotification(
        type,
        userName,
        data,
      );
    }

    if (channel === 'EMAIL' || channel === 'BOTH') {
      emailSuccess = await this.sendEmailNotification(
        type,
        user.email,
        userName,
        data,
      );
    }

    // Update notification status in database
    const status = slackSuccess || emailSuccess ? 'SENT' : 'FAILED';

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
    userName: string,
    data: any,
  ): Promise<boolean> {
    try {
      switch (type) {
        case 'DEADLINE_1H':
        case 'DEADLINE_24H':
        case 'DEADLINE_REMINDER':
          return await this.slackService.sendDeadlineReminder(
            data.deliverableTitle,
            data.projectName,
            data.deadline,
            userName,
            data.hoursRemaining,
          );

        case 'EXTENSION_REQUEST':
          return await this.slackService.sendExtensionRequest(
            data.deliverableTitle,
            data.projectName,
            userName,
            data.reason,
            data.requestedDate,
          );

        case 'EXTENSION_APPROVED':
          return await this.slackService.sendExtensionApproved(
            data.deliverableTitle,
            userName,
            data.newDeadline,
          );

        case 'EXTENSION_DENIED':
          return await this.slackService.sendExtensionDenied(
            data.deliverableTitle,
            userName,
            data.reason,
          );

        case 'SUBMISSION_APPROVED':
          return await this.slackService.sendSubmissionApproved(
            data.deliverableTitle,
            userName,
            data.feedback,
          );

        case 'SUBMISSION_REJECTED':
          return await this.slackService.sendSubmissionRejected(
            data.deliverableTitle,
            userName,
            data.feedback,
          );

        default:
          this.logger.warn(`Unknown notification type: ${type}`);
          return false;
      }
    } catch (error) {
      this.logger.error(`Slack notification failed:`, error);
      return false;
    }
  }

  private async sendEmailNotification(
    type: string,
    email: string,
    userName: string,
    data: any,
  ): Promise<boolean> {
    try {
      switch (type) {
        case 'DEADLINE_1H':
        case 'DEADLINE_24H':
        case 'DEADLINE_REMINDER':
          return await this.emailService.sendDeadlineReminder(
            email,
            userName,
            data.deliverableTitle,
            data.projectName,
            data.deadline,
            data.hoursRemaining,
          );

        case 'EXTENSION_APPROVED':
          return await this.emailService.sendExtensionApproved(
            email,
            userName,
            data.deliverableTitle,
            data.newDeadline,
          );

        case 'EXTENSION_DENIED':
          return await this.emailService.sendExtensionDenied(
            email,
            userName,
            data.deliverableTitle,
            data.reason,
          );

        case 'SUBMISSION_APPROVED':
          return await this.emailService.sendSubmissionApproved(
            email,
            userName,
            data.deliverableTitle,
            data.feedback,
          );

        case 'SUBMISSION_REJECTED':
          return await this.emailService.sendSubmissionRejected(
            email,
            userName,
            data.deliverableTitle,
            data.feedback,
          );

        default:
          this.logger.warn(`Unknown notification type: ${type}`);
          return false;
      }
    } catch (error) {
      this.logger.error(`Email notification failed:`, error);
      return false;
    }
  }
}
