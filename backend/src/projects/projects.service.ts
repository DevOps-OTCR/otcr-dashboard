import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(
    data: {
      name: string;
      description?: string;
      clientName?: string;
      startDate: string;
      endDate?: string;
      pmId?: string;
      memberIds?: string[];
    },
    userId: string,
  ) {
    const { name, description, clientName, startDate, endDate, pmId, memberIds } = data;

    // Verify PM exists and has PM or ADMIN role
    const pm = await this.prisma.user.findUnique({
      where: { id: pmId || userId },
    });

    if (!pm || (pm.role !== 'PM' && pm.role !== 'ADMIN')) {
      throw new BadRequestException('PM must have PM or ADMIN role');
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
          create: memberIds?.map((userId) => ({
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
    return this.prisma.project.delete({
      where: { id },
    });
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

    // Check if already a member
    const existingMember = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: user.id,
        leftAt: null,
      },
    });

    if (existingMember) {
      throw new BadRequestException('User is already a member');
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
}
