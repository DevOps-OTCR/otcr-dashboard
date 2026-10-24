import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DeadlineRemindersService } from './deadline-reminders.service';

@Injectable()
export class DeadlineSchedulerService {
  private readonly logger = new Logger(DeadlineSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private deadlineReminders: DeadlineRemindersService,
  ) {}

  /**
   * Hourly scan of upcoming deadlines.
   *
   * Hands every not-yet-final deliverable due in the future to the config-driven
   * reminder scheduler. rescheduleDeliverable is idempotent (one row per
   * deliverable/recipient/offset, deduped by deterministic BullMQ jobId) and
   * skips fire times that already passed, so repeated scans are safe and any
   * configured offset (24h, 1h, custom presets) is honored without hard-coded
   * time windows.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkUpcomingDeadlines() {
    this.logger.log('Checking for upcoming deadlines...');

    const now = new Date();

    const upcomingDeliverables = await this.prisma.deliverable.findMany({
      where: {
        deadline: { gte: now },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      select: { id: true },
    });

    this.logger.log(`Found ${upcomingDeliverables.length} upcoming deliverables`);

    for (const deliverable of upcomingDeliverables) {
      try {
        await this.deadlineReminders.rescheduleDeliverable(deliverable.id);
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to schedule reminders for deliverable ${deliverable.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Mark overdue deliverables every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async markOverdueDeliverables() {
    this.logger.log('Checking for overdue deliverables...');

    const now = new Date();

    const updated = await this.prisma.deliverable.updateMany({
      where: {
        deadline: {
          lt: now,
        },
        status: {
          notIn: ['APPROVED', 'SUBMITTED'],
        },
      },
      data: {
        status: 'OVERDUE',
      },
    });

    if (updated.count > 0) {
      this.logger.log(`Marked ${updated.count} deliverables as overdue`);
    }
  }

  /**
   * Send daily summary to PMs every morning at 9 AM
   */
  @Cron('0 9 * * *')
  async sendDailySummaryToPMs() {
    this.logger.log('Sending daily summary to PMs...');

    const pms = await this.prisma.user.findMany({
      where: {
        role: 'PM',
        active: true,
      },
      include: {
        pmProjects: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            deliverables: {
              where: {
                status: {
                  in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'],
                },
              },
            },
          },
        },
      },
    });

    for (const pm of pms) {
      const totalDeliverables = pm.pmProjects.reduce(
        (sum, project) => sum + project.deliverables.length,
        0,
      );

      const overdueCount = pm.pmProjects.reduce(
        (sum, project) =>
          sum +
          project.deliverables.filter((d) => d.status === 'OVERDUE').length,
        0,
      );

      const dueTodayCount = pm.pmProjects.reduce((sum, project) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return (
          sum +
          project.deliverables.filter(
            (d) => d.deadline >= today && d.deadline < tomorrow,
          ).length
        );
      }, 0);

      this.logger.log(
        `PM ${pm.email}: ${totalDeliverables} total, ${overdueCount} overdue, ${dueTodayCount} due today`,
      );

      // You can send an email summary here if needed
    }
  }

  /**
   * Clean up old completed notifications (keep last 30 days)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldNotifications() {
    this.logger.log('Cleaning up old notifications...');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deleted = await this.prisma.notification.deleteMany({
      where: {
        status: 'SENT',
        sentAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    this.logger.log(`Deleted ${deleted.count} old notifications`);
  }
}
