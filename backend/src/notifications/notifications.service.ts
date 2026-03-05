import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SlackService } from '../integrations/slack.service';
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
  private notificationQueue: Queue | null = null;

  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
    private configService: ConfigService,
  ) {
    const connection = createRedisConnection(this.configService);

    if (connection) {
      try {
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
      } catch (error) {
        this.logger.warn('Failed to initialize notification queue, notifications will be saved to database only');
      }
    } else {
      this.logger.warn('Redis not available, notifications will be saved to database only (no background processing)');
    }
  }

  async queueNotification(job: NotificationJob): Promise<void> {
    // Save to database
    await this.prisma.notification.create({
      data: {
        userId: job.userId,
        type: job.type,
        channel: job.channel,
        title: this.getNotificationTitle(job.type, job.data),
        message: this.getNotificationMessage(job.type, job.data),
        status: this.notificationQueue ? 'PENDING' : 'SENT',
        metadata: job.data as any,
      },
    });

    // Queue for background processing if Redis is available
    if (this.notificationQueue) {
      try {
        await this.notificationQueue.add('send-notification', job, {
          delay: 0,
        });
        this.logger.log(`Notification queued for user ${job.userId}`);
      } catch (error) {
        this.logger.warn(`Failed to queue notification, saved to database only: ${error.message}`);
      }
    } else {
      this.logger.log(`Notification saved to database for user ${job.userId} (Redis not available)`);
    }
  }

  async getNotificationsForUser(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        createdAt: true,
        metadata: true,
      },
    });
  }

  async queueBellMirrorNotification(input: {
    userId: string;
    sourceType?: string;
    title: string;
    message: string;
    taskId?: string;
    taskTitle?: string;
  }): Promise<void> {
    await this.queueNotification({
      userId: input.userId,
      type: 'PROJECT_UPDATED',
      channel: 'BOTH',
      data: {
        deliverableTitle: input.taskTitle || input.title,
        feedback: input.message,
        reason: input.sourceType,
        taskId: input.taskId,
        customTitle: input.title,
      } as any,
    });
  }

  async scheduleDeadlineReminder(
    deliverableId: string,
    hoursBeforeDeadline: number,
  ): Promise<void> {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      include: {
        assignments: {
          include: {
            user: true,
          },
        },
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

    const reminderRecipients =
      deliverable.assignments.length > 0
        ? deliverable.assignments.map((assignment) => ({
            userId: assignment.userId,
            user: assignment.user,
          }))
        : deliverable.project.members.map((member) => ({
            userId: member.userId,
            user: member.user,
          }));

    // Schedule reminder for each consultant on the project
    if (this.notificationQueue) {
      for (const recipient of reminderRecipients) {
        try {
          await this.notificationQueue.add(
            'send-notification',
            {
              userId: recipient.user.id,
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
              jobId: `reminder-${deliverableId}-${recipient.userId}-${hoursBeforeDeadline}h`,
            },
          );
        } catch (error) {
          this.logger.warn(`Failed to schedule reminder: ${error.message}`);
        }
      }
    } else {
      this.logger.warn('Cannot schedule deadline reminders: Redis not available');
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
      case 'PROJECT_UPDATED':
        return data?.deliverableTitle
          ? `Assignment Update: ${data.deliverableTitle}`
          : 'Assignment Update';
      case 'PROJECT_ASSIGNED':
        return data?.projectName
          ? `Project Assigned: ${data.projectName}`
          : 'Project Assigned';
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
      case 'PROJECT_UPDATED':
        return data?.feedback || 'Assignment has been updated.';
      case 'PROJECT_ASSIGNED':
        return data?.projectName
          ? `You have been assigned to project ${data.projectName}`
          : 'You have been assigned to a new project.';
      default:
        return 'You have a new notification';
    }
  }

  async getQueue(): Promise<Queue | null> {
    return this.notificationQueue;
  }
}
