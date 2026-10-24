import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationJob, NotificationsService } from '../notifications/notifications.service';
import { DeadlineRemindersService } from '../jobs/deadline-reminders.service';

const REVIEWER_NOTIFICATION_MAX_ATTEMPTS = 5;
const REVIEWER_NOTIFICATION_RETRY_DELAY_MS = 5 * 60 * 1000;
const REVIEWER_NOTIFICATION_RETRY_BATCH_SIZE = 50;

@Injectable()
export class DeliverablesService {
  private readonly logger = new Logger(DeliverablesService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private deadlineReminders: DeadlineRemindersService,
  ) {}

  private get deliverableSubtaskModel() {
    const model = (this.prisma as any).deliverableSubtask;
    if (!model) {
      throw new Error(
        'DeliverableSubtask model not found on Prisma client. Run: npx prisma generate',
      );
    }
    return model;
  }

  private getDisplayName(firstName?: string | null, lastName?: string | null, email?: string | null): string {
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    return fullName || 'Team member';
  }

  private getLateByMinutes(deadline: Date, submittedAt: Date): number {
    return Math.max(0, Math.floor((submittedAt.getTime() - deadline.getTime()) / 60000));
  }

  /** Synchronize after commit without failing the saved deliverable mutation. */
  private async syncReminders(deliverableId: string): Promise<void> {
    try {
      await this.deadlineReminders.rescheduleDeliverable(deliverableId);
    } catch (error: unknown) {
      this.logger.warn('Failed to reschedule reminders for ' + deliverableId + ': ' +
        (error instanceof Error ? error.message : String(error)));
    }
  }

  private async cancelReminders(deliverableId: string, reason: string): Promise<void> {
    try {
      await this.deadlineReminders.cancelRemindersForDeliverable(deliverableId, reason);
    } catch (error: unknown) {
      this.logger.warn('Failed to cancel reminders for ' + deliverableId + ': ' +
        (error instanceof Error ? error.message : String(error)));
    }
  }

  async create(
    projectId: string,
    data: {
      sprintId?: string;
      title: string;
      description?: string;
      type: string;
      deadline: string;
      templateKind?: string;
      assignProjectMembers?: boolean;
      assigneeIds?: string[];
    },
    actorUserId?: string,
  ) {
    if (data.assigneeIds !== undefined && data.assignProjectMembers) {
      throw new BadRequestException('Choose explicit assignees or all project members, not both');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const assigneeIds = data.assigneeIds === undefined
        ? [] : await this.validateAssignees(tx, projectId, data.assigneeIds);
      const deliverable = await tx.deliverable.create({
        data: {
          projectId,
          ...(data.sprintId ? { sprintId: data.sprintId } : {}),
          title: data.title,
          description: data.description,
          type: data.type as any,
          templateKind: (data.templateKind as any) || 'CUSTOM',
          deadline: new Date(data.deadline),
          status: 'PENDING',
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              pm: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          sprint: true,
          assignee: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              submissions: true,
              extensions: true,
            },
          },
        },
      } as any);

      if (assigneeIds.length > 0) {
        await tx.deliverableAssignment.createMany({
          data: assigneeIds.map((userId) => ({ deliverableId: deliverable.id, userId })),
        });
      }

      if (data.assignProjectMembers) {
        const projectMembers = await tx.projectMember.findMany({
          where: {
            projectId,
            leftAt: null,
          },
          select: {
            userId: true,
          },
        });
        const memberUserIds = [...new Set(projectMembers.map((member) => member.userId))];

        if (memberUserIds.length > 0) {
          await tx.deliverableAssignment.createMany({
            data: memberUserIds.map((userId) => ({
              deliverableId: deliverable.id,
              userId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return deliverable;
    });

    if (data.type === 'REPORT' && actorUserId) {
      await this.notifyClientNoteCreated(created.id, actorUserId);
    }

    // New deliverable: schedule reminders if the project has them enabled and
    // assignees exist (assignProjectMembers assignment happens inside the tx).
    await this.syncReminders(created.id);

    return created;
  }

  async findAll(
    user: any,
    query: {
      projectId?: string;
      sprintId?: string;
      status?: string;
      type?: string;
      releasedOnly?: boolean;
      overdue?: boolean;
      upcoming?: number;
      userId?: string;
      page: number;
      limit: number;
    },
  ) {
    const where: any = {};

    // Project filter
    if (query.projectId) {
      where.projectId = query.projectId;
    }

    if (query.sprintId) {
      where.sprintId = query.sprintId;
    }

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Type filter
    if (query.type) {
      where.type = query.type;
    }

    if (query.releasedOnly) {
      where.sprint = {
        ...(where.sprint ?? {}),
        status: 'RELEASED',
      };
    }

    // Overdue filter
    if (query.overdue) {
      where.deadline = { lt: new Date() };
      where.status = { notIn: ['SUBMITTED', 'APPROVED'] };
    }

    // Upcoming deadlines filter
    if (query.upcoming) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + query.upcoming);
      where.deadline = {
        gte: new Date(),
        lte: futureDate,
      };
      where.status = { notIn: ['SUBMITTED', 'APPROVED'] };
    }

    // User-specific filter (for their projects)
    if (query.userId || user.role === 'CONSULTANT') {
      const targetUserId = query.userId || user.id;
      where.project = {
        members: {
          some: {
            userId: targetUserId,
            leftAt: null,
          },
        },
      };
    } else if (user.role === 'PM' && !query.projectId) {
      // PMs see deliverables from their projects only (unless projectId specified)
      where.project = {
        pmId: user.id,
      };
    }

    const [deliverables, total] = await Promise.all([
      this.prisma.deliverable.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { deadline: 'asc' },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              clientName: true,
            },
          },
          sprint: {
            select: {
              id: true,
              label: true,
              sequenceNumber: true,
              weekStartDate: true,
              weekEndDate: true,
            },
          },
          assignee: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              submissions: true,
              extensions: true,
            },
          },
        },
      } as any),
      this.prisma.deliverable.count({ where }),
    ]);

    return {
      deliverables,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    return this.prisma.deliverable.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            pmId: true,
            pm: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        sprint: true,
        assignee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        subtasks: {
          orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
          include: {
            assignee: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        submissions: {
          orderBy: { submittedAt: 'desc' },
          include: {
            submitter: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        extensions: {
          orderBy: { requestedAt: 'desc' },
          include: {
            requester: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    } as any);
  }

  async update(
    id: string,
    data: {
      title?: string;
      description?: string;
      type?: string;
      deadline?: string;
      status?: string;
    },
  ) {
    const updated = await this.prisma.deliverable.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.type && { type: data.type as any }),
        ...(data.deadline && { deadline: new Date(data.deadline) }),
        ...(data.status && { status: data.status as any }),
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        sprint: {
          select: {
            id: true,
            label: true,
            sequenceNumber: true,
          },
        },
        assignee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            submissions: true,
            extensions: true,
          },
        },
      },
    } as any);

    // Deadline or status changed: reschedule (or cancel if now finalized).
    if (data.deadline || data.status) {
      if (['SUBMITTED', 'APPROVED'].includes((data.status ?? '').toUpperCase())) {
        await this.cancelReminders(id, 'Deliverable finalized');
      } else {
        await this.syncReminders(id);
      }
    }

    return updated;
  }

  async remove(id: string) {
    const deleted = await this.prisma.deliverable.delete({
      where: { id },
    });
    await this.cancelReminders(id, 'Deliverable deleted');
    return deleted;
  }

  async updateDeadline(id: string, deadline: string) {
    const updated = await this.prisma.deliverable.update({
      where: { id },
      data: {
        deadline: new Date(deadline),
        dueDateSource: 'MANUAL',
        manualDeadlineUpdatedAt: new Date(),
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        sprint: {
          select: {
            id: true,
            label: true,
            sequenceNumber: true,
          },
        },
        _count: {
          select: {
            submissions: true,
            extensions: true,
          },
        },
      },
    });
    // Deadline moved: recompute reminder fire times.
    await this.syncReminders(id);
    return updated;
  }

  private async validateAssignees(tx: Prisma.TransactionClient, projectId: string, value: unknown) {
    if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new BadRequestException('assigneeIds must be an array of user IDs');
    }
    const ids = [...new Set(value as string[])];
    if (!ids.length) return ids;
    const eligible = await tx.user.findMany({
      where: {
        id: { in: ids }, active: true,
        OR: [
          { pmProjects: { some: { id: projectId } } },
          { projectAssignments: { some: { projectId, leftAt: null } } },
        ],
      },
      select: { id: true },
    });
    if (eligible.length !== ids.length) {
      throw new BadRequestException('Assignees must be active users who manage or belong to this project');
    }
    return ids;
  }

  async setAssignments(id: string, projectId: string, value: unknown) {
    const result = await this.prisma.$transaction(async (tx) => {
      const ids = await this.validateAssignees(tx, projectId, value);
      // Keep retained assignments (and their assignedAt timestamps) intact.
      // Submissions belong to users independently and are never removed here.
      await tx.deliverableAssignment.deleteMany({
        where: { deliverableId: id, userId: { notIn: ids } },
      });
      if (ids.length) {
        await tx.deliverableAssignment.createMany({
          data: ids.map((userId) => ({ deliverableId: id, userId })), skipDuplicates: true,
        });
      }
      const assignments = await tx.deliverableAssignment.findMany({
        where: { deliverableId: id }, orderBy: { assignedAt: 'asc' },
        select: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      });
      return assignments.map(({ user }) => user);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.syncReminders(id);
    return result;
  }

  async updateAssignment(id: string, userId: string, assigned: boolean) {
    if (assigned) {
      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "DeliverableAssignment" ("id", "deliverableId", "userId", "assignedAt")
          VALUES (${this.createId()}, ${id}, ${userId}, NOW())
          ON CONFLICT ("deliverableId", "userId") DO NOTHING
        `,
      );
    } else {
      await this.prisma.$executeRaw(
        Prisma.sql`
          DELETE FROM "DeliverableAssignment"
          WHERE "deliverableId" = ${id} AND "userId" = ${userId}
        `,
      );
    }

    // Recipient set changed: rebuild reminders for the new assignee set.
    await this.syncReminders(id);

    return this.getAssignmentUsers(id);
  }

  async updateCompletion(id: string, completed: boolean) {
    const updated = await this.prisma.deliverable.update({
      where: { id },
      data: {
        completed,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        sprint: {
          select: {
            id: true,
            label: true,
            status: true,
          },
        },
        assignee: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
    await this.syncReminders(id);
    return updated;
  }

  async submitLink(id: string, userId: string, link: string) {
    const trimmedLink = link.trim();

    try {
      new URL(trimmedLink);
    } catch {
      throw new BadRequestException('Submission link must be a valid URL');
    }

    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        deadline: true,
        project: {
          select: {
            id: true,
            name: true,
            pmId: true,
          },
        },
      },
    });

    if (!deliverable) {
      throw new BadRequestException('Deliverable not found');
    }

    const latest = await this.prisma.submission.findFirst({
      where: { deliverableId: id, userId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
      },
    });

    const nextVersion = (latest?.version ?? 0) + 1;
    const submittedAt = new Date();
    const isLate = submittedAt.getTime() > deliverable.deadline.getTime();

    const submission = await this.prisma.submission.create({
      data: {
        deliverableId: id,
        userId,
        fileUrl: trimmedLink,
        fileName: `submission-v${nextVersion}.url`,
        fileSize: 0,
        mimeType: 'text/uri-list',
        version: nextVersion,
        replacesId: latest?.id,
        status: 'PENDING_REVIEW',
        submittedAt,
        isLate,
        reviewerNotificationStatus: 'PENDING',
      },
      include: {
        submitter: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await this.prisma.deliverable.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
      },
    });

    // Submitted: no more deadline reminders for this deliverable.
    await this.cancelReminders(id, 'Deliverable submitted');

    // The submission is already saved, so a notification failure must not fail the request.
    // It stays PENDING and retryPendingReviewerNotifications picks it up later.
    try {
      const delivered = await this.notifyProjectReviewersOnSubmission(submission.id, id, userId, {
        isLate,
        submittedAt,
        deadline: deliverable.deadline,
      });
      if (delivered) {
        await this.prisma.submission.update({
          where: { id: submission.id },
          data: { reviewerNotificationStatus: 'SENT' },
        });
        submission.reviewerNotificationStatus = 'SENT';
      }
    } catch (error) {
      this.logger.error(
        `Failed to notify reviewers for submission ${submission.id} on deliverable ${id}: ${error?.message ?? error}`,
      );
    }

    return submission;
  }

  async retryPendingReviewerNotifications(): Promise<void> {
    const pending = await this.prisma.submission.findMany({
      where: {
        reviewerNotificationStatus: 'PENDING',
        // Skip submissions whose original request may still be sending notifications
        submittedAt: { lt: new Date(Date.now() - REVIEWER_NOTIFICATION_RETRY_DELAY_MS) },
      },
      orderBy: { submittedAt: 'asc' },
      take: REVIEWER_NOTIFICATION_RETRY_BATCH_SIZE,
      select: {
        id: true,
        deliverableId: true,
        userId: true,
        isLate: true,
        submittedAt: true,
        reviewerNotificationAttempts: true,
        deliverable: { select: { deadline: true } },
      },
    });

    for (const submission of pending) {
      const attempts = submission.reviewerNotificationAttempts + 1;
      let delivered = false;
      try {
        delivered = await this.notifyProjectReviewersOnSubmission(
          submission.id,
          submission.deliverableId,
          submission.userId,
          {
            isLate: submission.isLate,
            submittedAt: submission.submittedAt,
            deadline: submission.deliverable.deadline,
          },
        );
      } catch (error) {
        this.logger.error(
          `Retry ${attempts} failed to notify reviewers for submission ${submission.id}: ${error?.message ?? error}`,
        );
      }

      let status: 'SENT' | 'PENDING' | 'FAILED' = 'PENDING';
      if (delivered) {
        status = 'SENT';
      } else if (attempts >= REVIEWER_NOTIFICATION_MAX_ATTEMPTS) {
        status = 'FAILED';
        this.logger.error(
          `Giving up on reviewer notifications for submission ${submission.id} after ${attempts} retries`,
        );
      }

      try {
        await this.prisma.submission.update({
          where: { id: submission.id },
          data: {
            reviewerNotificationStatus: status,
            reviewerNotificationAttempts: attempts,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to record reviewer notification retry for submission ${submission.id}: ${error?.message ?? error}`,
        );
      }
    }
  }

  // Skips recipients who already have this submission's notification, so retries never duplicate.
  private async queueSubmissionNotificationOnce(job: NotificationJob): Promise<boolean> {
    try {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: job.userId,
          type: job.type,
          metadata: { path: ['submissionId'], equals: job.data.submissionId },
        },
        select: { id: true },
      });
      if (!existing) {
        await this.notificationsService.queueNotification(job);
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send ${job.type} notification to ${job.userId} for submission ${job.data.submissionId}: ${error?.message ?? error}`,
      );
      return false;
    }
  }

  // Returns true when every reviewer notification was saved.
  private async notifyProjectReviewersOnSubmission(
    submissionId: string,
    deliverableId: string,
    submitterId: string,
    options?: {
      isLate?: boolean;
      submittedAt?: Date;
      deadline?: Date;
    },
  ): Promise<boolean> {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      select: {
        id: true,
        title: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true,
            pmId: true,
            members: {
              where: { leftAt: null, user: { role: 'LC', active: true } },
              select: { userId: true },
            },
          },
        },
      },
    });
    if (!deliverable) return true;

    const submitter = await this.prisma.user.findUnique({
      where: { id: submitterId },
      select: {
        role: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    const submitterName = this.getDisplayName(
      submitter?.firstName,
      submitter?.lastName,
      submitter?.email,
    );

    const reviewerIds = new Set<string>();
    if (deliverable.project.pmId) reviewerIds.add(deliverable.project.pmId);
    deliverable.project.members.forEach((member) => reviewerIds.add(member.userId));
    reviewerIds.delete(submitterId);

    let delivered = true;
    for (const reviewerId of reviewerIds) {
      const queued = await this.queueSubmissionNotificationOnce({
        userId: reviewerId,
        type: 'PROJECT_UPDATED',
        channel: 'BOTH',
        data: {
          projectName: deliverable.project.name,
          deliverableTitle: deliverable.title,
          feedback: `${submitterName} made a new submission to ${deliverable.title}.`,
          targetPath: '/deliverables',
          submissionId,
        },
      });
      delivered = delivered && queued;
    }

    if (
      options?.isLate &&
      submitter?.role === 'CONSULTANT' &&
      deliverable.project.pmId &&
      deliverable.project.pmId !== submitterId
    ) {
      const lateByMinutes = options.deadline && options.submittedAt
        ? this.getLateByMinutes(options.deadline, options.submittedAt)
        : 0;

      const queued = await this.queueSubmissionNotificationOnce({
        userId: deliverable.project.pmId,
        type: 'OVERDUE_ALERT',
        channel: 'BOTH',
        data: {
          projectName: deliverable.project.name,
          deliverableTitle: deliverable.title,
          submitterName,
          submittedAt: options.submittedAt,
          deadline: options.deadline,
          isLate: true,
          lateByMinutes,
          feedback: `${submitterName} submitted ${deliverable.title} after the deadline.`,
          targetPath: '/deliverables',
          submissionId,
        },
      });
      delivered = delivered && queued;
    }

    return delivered;
  }

  async findSubtask(id: string) {
    return this.deliverableSubtaskModel.findUnique({
      where: { id },
      include: {
        assignee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        deliverable: {
          select: {
            id: true,
            projectId: true,
            sprint: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    } as any);
  }

  async createSubtask(
    deliverableId: string,
    data: {
      title: string;
      notes?: string;
      dueDate?: string;
      assigneeId?: string;
    },
  ) {
    const title = data.title?.trim();
    if (!title) {
      throw new BadRequestException('Subtask title is required');
    }

    return this.deliverableSubtaskModel.create({
      data: {
        deliverableId,
        title,
        notes: data.notes?.trim() || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        assigneeId: data.assigneeId || null,
      },
      include: {
        assignee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    } as any);
  }

  async updateSubtask(
    id: string,
    data: {
      title?: string;
      notes?: string;
      dueDate?: string | null;
      completed?: boolean;
      assigneeId?: string | null;
    },
  ) {
    return this.deliverableSubtaskModel.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title.trim() }),
        ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
        ...(data.completed !== undefined && { completed: data.completed }),
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId || null }),
      },
      include: {
        assignee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    } as any);
  }

  async removeSubtask(id: string) {
    return this.deliverableSubtaskModel.delete({
      where: { id },
    });
  }

  async getAssignmentUserIds(deliverableId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ userId: string }>>(
      Prisma.sql`
        SELECT "userId"
        FROM "DeliverableAssignment"
        WHERE "deliverableId" = ${deliverableId}
      `,
    );

    return rows.map((row) => row.userId);
  }

  async getAssignmentUsers(deliverableId: string) {
    return this.prisma.$queryRaw<Array<{
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    }>>(
      Prisma.sql`
        SELECT
          u."id",
          u."email",
          u."firstName",
          u."lastName"
        FROM "DeliverableAssignment" da
        JOIN "User" u ON u."id" = da."userId"
        WHERE da."deliverableId" = ${deliverableId}
        ORDER BY da."assignedAt" ASC
      `,
    );
  }

  private createId() {
    return `da_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private async notifyClientNoteCreated(deliverableId: string, actorUserId: string): Promise<void> {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      select: {
        id: true,
        title: true,
        description: true,
        project: {
          select: {
            id: true,
            name: true,
            pmId: true,
            members: {
              where: { leftAt: null },
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!deliverable?.project) return;

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { firstName: true, lastName: true, email: true },
    });
    const actorName = this.getDisplayName(
      actor?.firstName,
      actor?.lastName,
      actor?.email,
    );

    const linkMatch = deliverable.description?.match(/\[\[CLIENT_NOTE_LINK:([^\]]+)\]\]/i);
    const noteLink = linkMatch?.[1]?.trim();
    const recipientIds = new Set<string>([
      deliverable.project.pmId,
      ...deliverable.project.members.map((member) => member.userId),
    ]);

    for (const userId of recipientIds) {
      await this.notificationsService.queueNotification({
        userId,
        type: 'PROJECT_UPDATED',
        channel: 'BOTH',
        data: {
          projectName: deliverable.project.name,
          deliverableTitle: deliverable.title,
          feedback: noteLink
            ? `${actorName} added client notes: ${deliverable.title}. Link: ${noteLink}`
            : `${actorName} added client notes: ${deliverable.title}.`,
        },
      });
    }
  }
}
