import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SlackService } from '../integrations/slack.service';
import { EmailService } from '../integrations/email.service';
import { createRedisConnection } from '../common/redis.config';
import {
  NotificationType,
  NotificationChannel,
} from '@prisma/client';

export interface NotificationJob {
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  data: {
    deliverableTitle?: string;
    projectName?: string;
    deadline?: Date;
    hoursRemaining?: number;
    reason?: string;
    requestedDate?: Date;
    feedback?: string;
    newDeadline?: Date;
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private notificationQueue: Queue;

  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    const connection = createRedisConnection(this.configService);

    this.notificationQueue = new Queue('notifications', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });

    this.logger.log('Notification queue initialized');
  }

  async queueNotification(job: NotificationJob): Promise<void> {
    await this.notificationQueue.add('send-notification', job, {
      delay: 0,
    });

    // Save to database
    await this.prisma.notification.create({
      data: {
        userId: job.userId,
        type: job.type,
        channel: job.channel,
        title: this.getNotificationTitle(job.type, job.data),
        message: this.getNotificationMessage(job.type, job.data),
        status: 'PENDING',
        metadata: job.data as any,
      },
    });

    this.logger.log(`Notification queued for user ${job.userId}`);
  }

  async scheduleDeadlineReminder(
    deliverableId: string,
    hoursBeforeDeadline: number,
  ): Promise<void> {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      include: {
        project: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!deliverable) {
      this.logger.warn(`Deliverable ${deliverableId} not found`);
      return;
    }

    const reminderTime = new Date(deliverable.deadline);
    reminderTime.setHours(reminderTime.getHours() - hoursBeforeDeadline);

    const delay = reminderTime.getTime() - Date.now();

    if (delay <= 0) {
      this.logger.warn('Reminder time is in the past, skipping');
      return;
    }

    // Schedule reminder for each consultant on the project
    for (const member of deliverable.project.members) {
      await this.notificationQueue.add(
        'send-notification',
        {
          userId: member.user.id,
          type: hoursBeforeDeadline === 1 ? 'DEADLINE_1H' : 'DEADLINE_24H',
          channel: 'BOTH',
          data: {
            deliverableTitle: deliverable.title,
            projectName: deliverable.project.name,
            deadline: deliverable.deadline,
            hoursRemaining: hoursBeforeDeadline,
          },
        } as NotificationJob,
        {
          delay,
          jobId: `reminder-${deliverableId}-${member.userId}-${hoursBeforeDeadline}h`,
        },
      );
    }

    this.logger.log(
      `Scheduled ${hoursBeforeDeadline}h reminder for deliverable ${deliverableId}`,
    );
  }

  async sendExtensionRequest(extensionId: string): Promise<void> {
    const extension = await this.prisma.extension.findUnique({
      where: { id: extensionId },
      include: {
        deliverable: {
          include: {
            project: {
              include: {
                pm: true,
              },
            },
          },
        },
        requester: true,
      },
    });

    if (!extension) {
      this.logger.warn(`Extension ${extensionId} not found`);
      return;
    }

    await this.queueNotification({
      userId: extension.deliverable.project.pm.id,
      type: 'EXTENSION_REQUEST',
      channel: 'BOTH',
      data: {
        deliverableTitle: extension.deliverable.title,
        projectName: extension.deliverable.project.name,
        reason: extension.reason,
        requestedDate: extension.requestedDueDate,
      },
    });
  }

  async sendExtensionResponse(extensionId: string): Promise<void> {
    const extension = await this.prisma.extension.findUnique({
      where: { id: extensionId },
      include: {
        deliverable: true,
        requester: true,
        approver: true,
      },
    });

    if (!extension) {
      this.logger.warn(`Extension ${extensionId} not found`);
      return;
    }

    const type =
      extension.status === 'APPROVED'
        ? 'EXTENSION_APPROVED'
        : 'EXTENSION_DENIED';

    await this.queueNotification({
      userId: extension.requester.id,
      type,
      channel: 'BOTH',
      data: {
        deliverableTitle: extension.deliverable.title,
        newDeadline: extension.requestedDueDate,
        reason: extension.approverNotes,
      },
    });
  }

  async sendSubmissionResponse(submissionId: string): Promise<void> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        deliverable: {
          include: {
            project: true,
          },
        },
        submitter: true,
      },
    });

    if (!submission) {
      this.logger.warn(`Submission ${submissionId} not found`);
      return;
    }

    const type =
      submission.status === 'APPROVED'
        ? 'SUBMISSION_APPROVED'
        : 'SUBMISSION_REJECTED';

    await this.queueNotification({
      userId: submission.submitter.id,
      type,
      channel: 'BOTH',
      data: {
        deliverableTitle: submission.deliverable.title,
        projectName: submission.deliverable.project.name,
        feedback: submission.feedback,
      },
    });
  }

  private getNotificationTitle(
    type: NotificationType,
    data: any,
  ): string {
    switch (type) {
      case 'DEADLINE_1H':
      case 'DEADLINE_24H':
        return `Deadline Reminder: ${data.deliverableTitle}`;
      case 'EXTENSION_REQUEST':
        return `Extension Request: ${data.deliverableTitle}`;
      case 'EXTENSION_APPROVED':
        return `Extension Approved: ${data.deliverableTitle}`;
      case 'EXTENSION_DENIED':
        return `Extension Denied: ${data.deliverableTitle}`;
      case 'SUBMISSION_APPROVED':
        return `Submission Approved: ${data.deliverableTitle}`;
      case 'SUBMISSION_REJECTED':
        return `Revision Requested: ${data.deliverableTitle}`;
      default:
        return 'Notification';
    }
  }

  private getNotificationMessage(
    type: NotificationType,
    data: any,
  ): string {
    switch (type) {
      case 'DEADLINE_1H':
        return `Your deliverable is due in 1 hour!`;
      case 'DEADLINE_24H':
        return `Your deliverable is due in 24 hours`;
      case 'EXTENSION_REQUEST':
        return `Extension request received for ${data.deliverableTitle}`;
      case 'EXTENSION_APPROVED':
        return `Your extension request has been approved`;
      case 'EXTENSION_DENIED':
        return `Your extension request was not approved`;
      case 'SUBMISSION_APPROVED':
        return `Your submission has been approved`;
      case 'SUBMISSION_REJECTED':
        return `Please revise and resubmit your work`;
      default:
        return 'You have a new notification';
    }
  }

  async getQueue(): Promise<Queue> {
    return this.notificationQueue;
  }
}
