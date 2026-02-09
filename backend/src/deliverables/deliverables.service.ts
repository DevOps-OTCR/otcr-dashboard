import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class DeliverablesService {
  constructor(private prisma: PrismaService) {}

  async create(
    projectId: string,
    data: {
      title: string;
      description?: string;
      type: string;
      deadline: string;
    },
  ) {
    return this.prisma.deliverable.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        type: data.type as any,
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
        _count: {
          select: {
            submissions: true,
            extensions: true,
          },
        },
      },
    });
  }

  async findAll(
    user: any,
    query: {
      projectId?: string;
      status?: string;
      type?: string;
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

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Type filter
    if (query.type) {
      where.type = query.type;
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
          _count: {
            select: {
              submissions: true,
              extensions: true,
            },
          },
        },
      }),
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
    });
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
        _count: {
          select: {
            submissions: true,
            extensions: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    return this.prisma.deliverable.delete({
      where: { id },
    });
  }
}