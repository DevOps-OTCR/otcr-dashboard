import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type SprintConfigInput = {
  sprintStartDay?: string;
  initialSlideDueDay?: string;
  finalSlideDueDay?: string;
  defaultDueTime?: string;
  sprintTimezone?: string;
  autoGenerateSprints?: boolean;
};

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  private splitNameParts(name?: string | null): { firstName: string | null; lastName: string | null } {
    const normalized = (name || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return { firstName: null, lastName: null };
    const parts = normalized.split(' ');
    return {
      firstName: parts[0] || null,
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
    };
  }

  async create(
    data: {
      name: string;
      description?: string;
      clientName?: string;
      startDate: string;
      endDate?: string;
      pmId?: string;
      memberIds?: string[];
      memberEmails?: string[];
    },
    userId: string,
  ) {
    const { name, description, clientName, startDate, endDate, pmId, memberIds, memberEmails } = data;

    // Verify PM exists and has PM or ADMIN role
    const pm = await this.prisma.user.findUnique({
      where: { id: pmId || userId },
    });

    if (!pm || (pm.role !== 'PM' && pm.role !== 'ADMIN')) {
      throw new BadRequestException('PM must have PM or ADMIN role');
    }

    const normalizedMemberIds = Array.from(
      new Set((memberIds ?? []).map((id) => id.trim()).filter(Boolean)),
    );
    const normalizedMemberEmails = Array.from(
      new Set((memberEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean)),
    );

    let resolvedMemberIds = normalizedMemberIds;

    if (normalizedMemberEmails.length > 0) {
      let usersByEmail = await this.prisma.user.findMany({
        where: {
          email: { in: normalizedMemberEmails },
        },
        select: { id: true, email: true },
      });

      let foundEmailSet = new Set(usersByEmail.map((user) => user.email.toLowerCase()));
      const missingEmails = normalizedMemberEmails.filter((email) => !foundEmailSet.has(email));

      if (missingEmails.length > 0) {
        const allowedEntries = await this.prisma.allowedEmail.findMany({
          where: {
            email: { in: missingEmails },
            active: true,
          },
          select: { email: true, role: true },
        });

        const allowedByEmail = new Map(
          allowedEntries.map((entry) => [entry.email.toLowerCase(), entry]),
        );
        const disallowedEmails = missingEmails.filter((email) => !allowedByEmail.has(email));

        if (disallowedEmails.length > 0) {
          throw new BadRequestException(
            `Users not found for emails: ${disallowedEmails.join(', ')}`,
          );
        }

        const onboardingEntries = await (this.prisma as any).onboardingRequest.findMany({
          where: { email: { in: missingEmails } },
          select: { email: true, name: true },
        });
        const onboardingNameByEmail = new Map<string, string>(
          onboardingEntries.map((entry: { email: string; name?: string | null }) => [
            String(entry.email).toLowerCase(),
            entry.name || '',
          ]),
        );

        await this.prisma.user.createMany({
          data: missingEmails.map((email) => ({
            email,
            ...this.splitNameParts(onboardingNameByEmail.get(email) || null),
            role: (allowedByEmail.get(email)?.role ?? 'CONSULTANT') as any,
          })),
          skipDuplicates: true,
        });

        usersByEmail = await this.prisma.user.findMany({
          where: {
            email: { in: normalizedMemberEmails },
          },
          select: { id: true, email: true },
        });
        foundEmailSet = new Set(usersByEmail.map((user) => user.email.toLowerCase()));
      }

      resolvedMemberIds = Array.from(new Set([...normalizedMemberIds, ...usersByEmail.map((u) => u.id)]));
    }

    // Create project with members
    const project = await this.prisma.project.create({
      data: {
        name,
        description,
        clientName,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        pmId: pmId || userId,
        status: 'ACTIVE',
        members: {
          create: resolvedMemberIds.map((userId) => ({
            userId,
          })) || [],
        },
      },
      include: {
        pm: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    return project;
  }

  async findAll(query: {
    status?: string;
    search?: string;
    pmId?: string;
    userId?: string;
    includeMembers?: boolean;
    includeDeliverables?: boolean;
    page: number;
    limit: number;
  }) {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.pmId) {
      where.pmId = query.pmId;
    }

    if (query.userId) {
      where.members = {
        some: {
          userId: query.userId,
          leftAt: null,
        },
      };
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { clientName: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const include: any = {
      pm: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      _count: {
        select: {
          deliverables: true,
          members: true,
        },
      },
    };

    if (query.includeMembers) {
      include.members = {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      };
    }

    if (query.includeDeliverables) {
      include.deliverables = {
        orderBy: { deadline: 'asc' },
      };
    }

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      projects,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findByMember(
    userId: string,
    query: {
      status?: string;
      search?: string;
      includeMembers?: boolean;
      includeDeliverables?: boolean;
      page: number;
      limit: number;
    },
  ) {
    const where: any = {
      members: {
        some: {
          userId,
          leftAt: null,
        },
      },
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { clientName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const include: any = {
      pm: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      _count: {
        select: {
          deliverables: true,
          members: true,
        },
      },
    };

    if (query.includeMembers) {
      include.members = {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      };
    }

    if (query.includeDeliverables) {
      include.deliverables = {
        orderBy: { deadline: 'asc' },
      };
    }

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      projects,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(
    id: string,
    options?: { includeMembers?: boolean; includeDeliverables?: boolean },
  ) {
    const include: any = {
      pm: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      _count: {
        select: {
          deliverables: true,
          members: true,
        },
      },
    };

    if (options?.includeMembers) {
      include.members = {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      };
    }

    if (options?.includeDeliverables) {
      include.deliverables = {
        orderBy: { deadline: 'asc' },
      };
    }

    return this.prisma.project.findUnique({
      where: { id },
      include,
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      clientName?: string;
      startDate?: string;
      endDate?: string;
      status?: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
    },
  ) {
    const { name, description, clientName, startDate, endDate, status } = data;

    return this.prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(clientName !== undefined && { clientName }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && {
          endDate: endDate ? new Date(endDate) : null,
        }),
        ...(status && { status }),
      },
      include: {
        pm: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
        _count: {
          select: {
            deliverables: true,
            members: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const deliverables = await tx.deliverable.findMany({
          where: { projectId: id },
          select: { id: true },
        });
        const deliverableIds = deliverables.map((row) => row.id);

        if (deliverableIds.length > 0) {
          await tx.extension.deleteMany({
            where: { deliverableId: { in: deliverableIds } },
          });
          await tx.submission.deleteMany({
            where: { deliverableId: { in: deliverableIds } },
          });
          await tx.deliverableAssignment.deleteMany({
            where: { deliverableId: { in: deliverableIds } },
          });
        }

        await tx.deliverable.deleteMany({
          where: { projectId: id },
        });
        await tx.sprint.deleteMany({
          where: { projectId: id },
        });
        await tx.projectMember.deleteMany({
          where: { projectId: id },
        });

        // Tasks can target a project without an FK relation; clear links first.
        await tx.task.updateMany({
          where: { projectId: id },
          data: { projectId: null },
        });

        return tx.project.delete({
          where: { id },
        });
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('Project not found');
        }
        if (error.code === 'P2003') {
          throw new BadRequestException(
            'Cannot delete project because related records still reference it',
          );
        }
      }

      throw new InternalServerErrorException('Failed to delete project');
    }
  }

  async addMember(projectId: string, input: { userId?: string; email?: string }) {
    const userId = input.userId?.trim();
    const email = input.email?.trim().toLowerCase();

    if (!userId && !email) {
      throw new BadRequestException('Provide userId or email');
    }

    // Check if user exists
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
        })
      : await this.prisma.user.findUnique({
          where: { email: email! },
        });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.firstName && !user.lastName && user.email) {
      const onboarding = await (this.prisma as any).onboardingRequest.findUnique({
        where: { email: user.email.toLowerCase() },
        select: { name: true },
      });
      const parsed = this.splitNameParts(onboarding?.name ?? null);
      if (parsed.firstName || parsed.lastName) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            firstName: parsed.firstName,
            lastName: parsed.lastName,
          },
        });
        user.firstName = parsed.firstName;
        user.lastName = parsed.lastName;
      }
    }

    // Check if already an active member
    const existingActiveMember = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: user.id,
        leftAt: null,
      },
    });

    if (existingActiveMember) {
      throw new BadRequestException('User is already a member');
    }

    // If the user was previously removed, reactivate the same membership row
    // to avoid unique(projectId, userId) violations.
    const existingAnyMember = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: user.id,
      },
      orderBy: { joinedAt: 'desc' },
    });

    if (existingAnyMember) {
      return this.prisma.projectMember.update({
        where: { id: existingAnyMember.id },
        data: {
          leftAt: null,
          joinedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });
    }

    return this.prisma.projectMember.create({
      data: {
        projectId,
        userId: user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });
  }

  async removeMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
        leftAt: null,
      },
    });

    if (!member) {
      throw new BadRequestException('User is not a member of this project');
    }

    return this.prisma.projectMember.update({
      where: { id: member.id },
      data: { leftAt: new Date() },
    });
  }

  async getMembers(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: {
        projectId,
        leftAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'asc',
      },
    });
  }

  async isMember(projectId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
        leftAt: null,
      },
    });

    return !!member;
  }

  async getSprintConfig(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        sprintStartDay: true,
        initialSlideDueDay: true,
        finalSlideDueDay: true,
        defaultDueTime: true,
        sprintTimezone: true,
        autoGenerateSprints: true,
        updatedAt: true,
      },
    });
  }

  async updateSprintConfig(projectId: string, input: SprintConfigInput) {
    const data: Record<string, unknown> = {};

    if (input.sprintStartDay) {
      data.sprintStartDay = this.assertWeekday(input.sprintStartDay, 'sprintStartDay');
    }
    if (input.initialSlideDueDay) {
      data.initialSlideDueDay = this.assertWeekday(input.initialSlideDueDay, 'initialSlideDueDay');
    }
    if (input.finalSlideDueDay) {
      data.finalSlideDueDay = this.assertWeekday(input.finalSlideDueDay, 'finalSlideDueDay');
    }
    if (input.defaultDueTime !== undefined) {
      data.defaultDueTime = this.assertDueTime(input.defaultDueTime);
    }
    if (input.sprintTimezone !== undefined) {
      data.sprintTimezone = input.sprintTimezone.trim() || 'America/Chicago';
    }
    if (typeof input.autoGenerateSprints === 'boolean') {
      data.autoGenerateSprints = input.autoGenerateSprints;
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data,
      select: {
        id: true,
        sprintStartDay: true,
        initialSlideDueDay: true,
        finalSlideDueDay: true,
        defaultDueTime: true,
        sprintTimezone: true,
        autoGenerateSprints: true,
        updatedAt: true,
      },
    });
  }

  async listSprints(projectId: string) {
    try {
      const sprints = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          s."id",
          s."projectId",
          s."sequenceNumber",
          s."label",
          s."weekStartDate",
          s."weekEndDate",
          s."status"::text AS "status",
          s."configSnapshot",
          s."createdAt",
          s."updatedAt"
        FROM "Sprint" s
        WHERE s."projectId" = ${projectId}
        ORDER BY s."sequenceNumber" DESC
      `);

      if (sprints.length === 0) return [];

      const sprintIds = sprints.map((sprint) => sprint.id);
      const deliverables = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          d."id",
          d."sprintId",
          d."title",
          d."deadline",
          d."templateKind"::text AS "templateKind",
          d."status"::text AS "status",
          d."completed"
        FROM "Deliverable" d
        WHERE d."sprintId" IN (${Prisma.join(sprintIds)})
        ORDER BY d."deadline" ASC
      `);

      const deliverableIds = deliverables.map((deliverable) => deliverable.id);
      const assignments = deliverableIds.length
        ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT
              da."deliverableId",
              da."userId",
              da."assignedAt",
              u."email",
              u."firstName",
              u."lastName"
            FROM "DeliverableAssignment" da
            JOIN "User" u ON u."id" = da."userId"
            WHERE da."deliverableId" IN (${Prisma.join(deliverableIds)})
            ORDER BY da."assignedAt" ASC
          `)
        : [];
      const latestSubmissions = deliverableIds.length
        ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT DISTINCT ON (s."deliverableId")
              s."id",
              s."deliverableId",
              s."fileUrl",
              s."submittedAt",
              s."status"::text AS "status",
              u."id" AS "submitterId",
              u."email" AS "submitterEmail",
              u."firstName" AS "submitterFirstName",
              u."lastName" AS "submitterLastName"
            FROM "Submission" s
            JOIN "User" u ON u."id" = s."userId"
            WHERE s."deliverableId" IN (${Prisma.join(deliverableIds)})
            ORDER BY s."deliverableId", s."submittedAt" DESC
          `)
        : [];

      const bySprint = new Map<string, any[]>();
      const assignmentsByDeliverable = new Map<string, any[]>();
      const latestSubmissionByDeliverable = new Map<string, any>();

      assignments.forEach((assignment) => {
        const existing = assignmentsByDeliverable.get(assignment.deliverableId) ?? [];
        existing.push({
          id: assignment.userId,
          email: assignment.email,
          firstName: assignment.firstName,
          lastName: assignment.lastName,
          assignedAt: assignment.assignedAt,
        });
        assignmentsByDeliverable.set(assignment.deliverableId, existing);
      });
      latestSubmissions.forEach((submission) => {
        latestSubmissionByDeliverable.set(submission.deliverableId, {
          id: submission.id,
          fileUrl: submission.fileUrl,
          submittedAt: submission.submittedAt,
          status: submission.status,
          submitter: {
            id: submission.submitterId,
            email: submission.submitterEmail,
            firstName: submission.submitterFirstName,
            lastName: submission.submitterLastName,
          },
        });
      });

      deliverables.forEach((deliverable) => {
        const existing = bySprint.get(deliverable.sprintId) ?? [];
        existing.push({
          id: deliverable.id,
          title: deliverable.title,
          deadline: deliverable.deadline,
          templateKind: deliverable.templateKind,
          status: deliverable.status,
          completed: deliverable.completed,
          assignees: assignmentsByDeliverable.get(deliverable.id) ?? [],
          latestSubmission: latestSubmissionByDeliverable.get(deliverable.id) ?? null,
        });
        bySprint.set(deliverable.sprintId, existing);
      });

      return sprints.map((sprint) => ({
        ...sprint,
        deliverables: bySprint.get(sprint.id) ?? [],
      }));
    } catch (error) {
      console.warn('Failed to load sprints.', error);
      throw new BadRequestException(
        'Unable to load sprints right now. Confirm the sprint schema SQL has been applied, then try again.',
      );
    }
  }

  async getSprint(projectId: string, sprintId: string) {
    const sprints = await this.listSprints(projectId);
    return sprints.find((sprint: any) => sprint.id === sprintId) ?? null;
  }

  async updateSprintStatus(projectId: string, sprintId: string, status: 'DRAFT' | 'RELEASED') {
    try {
      const result = await this.prisma.sprint.updateMany({
        where: {
          id: sprintId,
          projectId,
        },
        data: {
          status: status as any,
        },
      });

      if (result.count === 0) {
        throw new BadRequestException('Sprint not found');
      }

      const sprint = await this.getSprint(projectId, sprintId);

      if (!sprint) {
        throw new BadRequestException('Sprint not found');
      }

      if (status === 'RELEASED') {
        await this.notifySprintReleased(projectId, sprint);
      }

      return sprint;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      console.warn('Failed to update sprint status.', error);
      throw new BadRequestException('Unable to update this week right now. Please try again.');
    }
  }

  private async notifySprintReleased(projectId: string, sprint: {
    id: string;
    label: string;
    deliverables?: Array<{ id: string }>;
  }): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        pmId: true,
        members: {
          where: { leftAt: null },
          select: { userId: true },
        },
      },
    });

    if (!project) return;

    const recipientIds = new Set<string>([
      project.pmId,
      ...project.members.map((member) => member.userId),
    ]);
    const deliverableCount = Array.isArray(sprint.deliverables) ? sprint.deliverables.length : 0;
    const countSuffix = deliverableCount > 0 ? ` (${deliverableCount} deliverable${deliverableCount === 1 ? '' : 's'})` : '';

    for (const userId of recipientIds) {
      await this.notificationsService.queueNotification({
        userId,
        type: 'PROJECT_UPDATED',
        channel: 'BOTH',
        data: {
          projectName: project.name,
          deliverableTitle: sprint.label,
          feedback: `${sprint.label} has been released${countSuffix}. Deliverables are now available for review and updates.`,
        },
      });
    }
  }

  async deleteSprint(projectId: string, sprintId: string) {
    try {
      const deletedSprintId = await this.prisma.$transaction(async (tx) => {
        const sprint = await tx.sprint.findFirst({
          where: {
            id: sprintId,
            projectId,
          },
          select: {
            id: true,
          },
        });

        if (!sprint) {
          throw new BadRequestException('Sprint not found');
        }

        const result = await tx.sprint.deleteMany({
          where: {
            id: sprint.id,
          },
        });

        if (result.count === 0) {
          throw new BadRequestException('Sprint not found');
        }

        const remainingSprints = await tx.sprint.findMany({
          where: {
            projectId,
          },
          orderBy: [
            { weekStartDate: 'asc' },
            { createdAt: 'asc' },
          ],
          select: {
            id: true,
          },
        });

        for (const [index, remainingSprint] of remainingSprints.entries()) {
          const nextSequence = index + 1;
          await tx.sprint.update({
            where: {
              id: remainingSprint.id,
            },
            data: {
              sequenceNumber: nextSequence,
              label: `Week ${nextSequence}`,
            },
          });
        }

        return sprint.id;
      });

      return {
        id: deletedSprintId,
        deleted: true,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      console.warn('Failed to delete sprint.', error);
      throw new BadRequestException('Unable to delete this week right now. Please try again.');
    }
  }

  async generateNextSprint(projectId: string) {
    try {
      const createdSprintId = await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: {
            id: true,
            name: true,
            sprintStartDay: true,
            initialSlideDueDay: true,
            finalSlideDueDay: true,
            defaultDueTime: true,
            sprintTimezone: true,
            autoGenerateSprints: true,
            startDate: true,
            members: {
              where: {
                leftAt: null,
              },
              select: {
                userId: true,
              },
            },
            sprints: {
              orderBy: { sequenceNumber: 'desc' },
              take: 1,
              select: {
                sequenceNumber: true,
                weekStartDate: true,
              },
            },
          },
        });

        if (!project) {
          throw new BadRequestException('Project not found');
        }

        const latestSprint = project.sprints[0];
        const sequenceNumber = latestSprint ? latestSprint.sequenceNumber + 1 : 1;
        const baseDate = latestSprint
          ? this.addDaysUtc(latestSprint.weekStartDate, 7)
          : project.startDate;
        const weekStartDate = this.alignToWeekday(baseDate, project.sprintStartDay);
        const weekEndDate = this.addDaysUtc(weekStartDate, 6);
        const configSnapshot = {
          sprintStartDay: project.sprintStartDay,
          initialSlideDueDay: project.initialSlideDueDay,
          finalSlideDueDay: project.finalSlideDueDay,
          defaultDueTime: project.defaultDueTime,
          sprintTimezone: project.sprintTimezone,
          autoGenerateSprints: project.autoGenerateSprints,
        };

        const createdSprint = await tx.sprint.create({
          data: {
            projectId: project.id,
            sequenceNumber,
            label: `Week ${sequenceNumber}`,
            weekStartDate,
            weekEndDate,
            status: 'DRAFT' as any,
            configSnapshot,
            deliverables: {
              create: [
                {
                  projectId: project.id,
                  title: `Initial Slides - Week ${sequenceNumber}`,
                  description: `Auto-generated initial slide deliverable for Week ${sequenceNumber}.`,
                  type: 'PRESENTATION',
                  templateKind: 'INITIAL_SLIDES',
                  dueDateSource: 'AUTO',
                  deadline: this.buildDeadlineForWeek(
                    weekStartDate,
                    project.initialSlideDueDay,
                    project.defaultDueTime,
                  ),
                  status: 'PENDING',
                },
                {
                  projectId: project.id,
                  title: `Final Slides - Week ${sequenceNumber}`,
                  description: `Auto-generated final slide deliverable for Week ${sequenceNumber}.`,
                  type: 'PRESENTATION',
                  templateKind: 'FINAL_SLIDES',
                  dueDateSource: 'AUTO',
                  deadline: this.buildDeadlineForWeek(
                    weekStartDate,
                    project.finalSlideDueDay,
                    project.defaultDueTime,
                  ),
                  status: 'PENDING',
                },
              ],
            },
          },
          select: {
            id: true,
            deliverables: {
              select: {
                id: true,
              },
            },
          },
        });

        const autoAssignedUserIds = Array.from(
          new Set(project.members.map((member) => member.userId)),
        );

        if (autoAssignedUserIds.length > 0 && createdSprint.deliverables.length > 0) {
          await tx.deliverableAssignment.createMany({
            data: createdSprint.deliverables.flatMap((deliverable) =>
              autoAssignedUserIds.map((userId) => ({
                deliverableId: deliverable.id,
                userId,
              })),
            ),
            skipDuplicates: true,
          });
        }

        return createdSprint.id;
      });

      const sprint = await this.getSprint(projectId, createdSprintId);

      if (!sprint) {
        throw new BadRequestException('Unable to load the new week after creation.');
      }

      return sprint;
    } catch (error) {
      console.warn('Failed to generate sprint.', error);
      throw new BadRequestException(
        'Unable to generate a sprint right now.',
      );
    }
  }

  async getDashboardProjects(user: any) {
    const { role, id: userId } = user;

    switch (role) {
      case 'ADMIN':
        return this.getAdminDashboard();

      case 'PM':
        return this.getPMDashboard(userId);

      case 'CONSULTANT':
        return this.getMemberDashboard(userId);

      default:
        return { projects: [] };
    }
  }

  private async getAdminDashboard() {
    const [activeProjects, projectStats] = await Promise.all([
      this.prisma.project.findMany({
        where: { status: 'ACTIVE' },
        take: 10,
        orderBy: { startDate: 'desc' },
        include: {
          pm: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              members: true,
              deliverables: true,
            },
          },
        },
      }),
      this.prisma.project.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    return {
      activeProjects,
      stats: projectStats,
    };
  }

  private async getPMDashboard(pmId: string) {
    const projects = await this.prisma.project.findMany({
      where: { pmId },
      orderBy: { startDate: 'desc' },
      include: {
        _count: {
          select: {
            members: true,
            deliverables: true,
          },
        },
        members: {
          where: { leftAt: null },
          take: 5,
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    return { projects };
  }

  private async getMemberDashboard(userId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        members: {
          some: {
            userId,
            leftAt: null,
          },
        },
        status: 'ACTIVE',
      },
      orderBy: { startDate: 'desc' },
      include: {
        pm: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: {
            members: true,
            deliverables: true,
          },
        },
      },
    });

    return { projects };
  }

  private assertWeekday(value: string, fieldName: string) {
    const normalized = value.trim().toUpperCase();
    const allowed = new Set([
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY',
    ]);

    if (!allowed.has(normalized)) {
      throw new BadRequestException(`${fieldName} must be a valid weekday`);
    }

    return normalized;
  }

  private assertDueTime(value: string) {
    const normalized = value.trim();
    if (!/^\d{2}:\d{2}$/.test(normalized)) {
      throw new BadRequestException('defaultDueTime must use HH:MM (24-hour) format');
    }

    const [hours, minutes] = normalized.split(':').map((part) => Number.parseInt(part, 10));
    if (hours > 23 || minutes > 59) {
      throw new BadRequestException('defaultDueTime must be a valid 24-hour time');
    }

    return normalized;
  }

  private alignToWeekday(date: Date, weekday: string) {
    const current = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
    );
    const currentDay = this.toIsoWeekday(current.getUTCDay());
    const targetDay = this.weekdayToIsoNumber(weekday);
    const offset = (targetDay - currentDay + 7) % 7;
    return this.addDaysUtc(current, offset);
  }

  private buildDeadlineForWeek(weekStartDate: Date, weekday: string, dueTime: string) {
    const targetDate = this.alignToWeekday(weekStartDate, weekday);
    const [hours, minutes] = dueTime.split(':').map((part) => Number.parseInt(part, 10));
    targetDate.setUTCHours(hours, minutes, 0, 0);
    return targetDate;
  }

  private addDaysUtc(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private weekdayToIsoNumber(weekday: string) {
    const mapping: Record<string, number> = {
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 7,
    };

    return mapping[weekday] ?? 1;
  }

  private toIsoWeekday(jsDay: number) {
    return jsDay === 0 ? 7 : jsDay;
  }
}
