import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { User } from '@prisma/client';

type TaskAssigneeType = 'PERSON' | 'ALL' | 'ALL_PMS' | 'ALL_TEAM';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private get taskModel() {
    const model = (this.prisma as any).task;
    if (!model) {
      throw new Error(
        'Task model not found on Prisma client. Run: npx prisma generate',
      );
    }
    return model;
  }

  /** Whether the task applies to the given user (assignee resolution). */
  async taskAppliesToUser(task: { assigneeType: string; assigneeEmail?: string | null; projectId?: string | null }, user: User): Promise<boolean> {
    if (task.assigneeType === 'PERSON') {
      return task.assigneeEmail?.toLowerCase() === user.email?.toLowerCase();
    }
    if (task.assigneeType === 'ALL') return true;
    if (task.assigneeType === 'ALL_PMS') return user.role === 'PM' || user.role === 'ADMIN';
    if (task.assigneeType === 'ALL_TEAM' && task.projectId) {
      const member = await this.prisma.projectMember.findFirst({
        where: { projectId: task.projectId, userId: user.id, leftAt: null },
      });
      return !!member;
    }
    return false;
  }

  /** Get tasks that apply to the current user (for action center). */
  async findForUser(user: User, query: { workstreamId?: string; includeCompleted?: boolean }) {
    const allTasks = await this.taskModel.findMany({
      where: query.workstreamId ? { workstreamId: query.workstreamId } : undefined,
      orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }],
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    const filtered: typeof allTasks = [];
    for (const task of allTasks) {
      const applies = await this.taskAppliesToUser(task, user);
      if (applies) filtered.push(task);
    }

    if (query.includeCompleted === false) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return filtered.filter((t) => !t.completed || new Date(t.dueDate) >= today);
    }
    return filtered;
  }

  async create(
    data: {
      taskName: string;
      description?: string;
      dueDate: string;
      projectName: string;
      workstream: string;
      workstreamId?: string;
      assigneeType: TaskAssigneeType;
      assigneeEmail?: string;
      projectId?: string;
    },
    createdById: string
  ) {
    return this.taskModel.create({
      data: {
        taskName: data.taskName,
        description: data.description,
        dueDate: new Date(data.dueDate),
        projectName: data.projectName,
        workstream: data.workstream,
        workstreamId: data.workstreamId,
        assigneeType: data.assigneeType,
        assigneeEmail: data.assigneeEmail,
        projectId: data.projectId,
        createdById,
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  async update(
    id: string,
    data: {
      taskName?: string;
      description?: string;
      dueDate?: string;
      status?: string;
      completed?: boolean;
      assigneeType?: TaskAssigneeType;
      assigneeEmail?: string;
      projectId?: string;
    }
  ) {
    return this.taskModel.update({
      where: { id },
      data: {
        ...(data.taskName != null && { taskName: data.taskName }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.dueDate != null && { dueDate: new Date(data.dueDate) }),
        ...(data.status != null && { status: data.status as any }),
        ...(data.completed !== undefined && { completed: data.completed }),
        ...(data.assigneeType != null && { assigneeType: data.assigneeType }),
        ...(data.assigneeEmail !== undefined && { assigneeEmail: data.assigneeEmail }),
        ...(data.projectId !== undefined && { projectId: data.projectId }),
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  async remove(id: string) {
    try {
      return await this.taskModel.delete({ where: { id } });
    } catch {
      throw new NotFoundException('Task not found');
    }
  }

  async findOne(id: string) {
    const task = await this.taskModel.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }
}
