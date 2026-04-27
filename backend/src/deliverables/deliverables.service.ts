import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DeliverablesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
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
    },
    actorUserId?: string,
  ) {
    const created = await this.prisma.$transaction(async (tx) => {
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
    return this.prisma.deliverable.update({
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
  }

  async remove(id: string) {
    return this.prisma.deliverable.delete({
      where: { id },
    });
  }

  async updateDeadline(id: string, deadline: string) {
    return this.prisma.deliverable.update({
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

    return this.getAssignmentUsers(id);
  }

  async updateCompletion(id: string, completed: boolean) {
    return this.prisma.deliverable.update({
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
    } as any);
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

    await this.notifyProjectReviewersOnSubmission(id, userId, {
      isLate,
      submittedAt,
      deadline: deliverable.deadline,
    });

    return submission;
  }

  private async notifyProjectReviewersOnSubmission(
    deliverableId: string,
    submitterId: string,
    options?: {
      isLate?: boolean;
      submittedAt?: Date;
      deadline?: Date;
    },
  ): Promise<void> {
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
    if (!deliverable) return;

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

    for (const reviewerId of reviewerIds) {
      await this.notificationsService.queueNotification({
        userId: reviewerId,
        type: 'PROJECT_UPDATED',
        channel: 'BOTH',
        data: {
          projectName: deliverable.project.name,
          deliverableTitle: deliverable.title,
          feedback: `${submitterName} made a new submission to ${deliverable.title}.`,
          targetPath: '/deliverables',
        },
      });
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

      await this.notificationsService.queueNotification({
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
        },
      });
    }
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
