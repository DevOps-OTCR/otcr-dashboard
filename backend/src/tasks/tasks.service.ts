import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { User } from '@prisma/client';

type TaskAssigneeType = 'PERSON' | 'ALL' | 'ALL_PMS' | 'ALL_TEAM';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}
  private static readonly DEFAULT_DUE_TIME = '23:59';
  private static readonly CHICAGO_TIMEZONE = 'America/Chicago';

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
      if (user.role === 'PM' || user.role === 'ADMIN') {
        const project = await this.prisma.project.findUnique({
          where: { id: task.projectId },
          select: { pmId: true },
        });
        if (project?.pmId === user.id || user.role === 'ADMIN') {
          return true;
        }
      }

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
      dueTime?: string;
      projectName: string;
      workstream: string;
      workstreamId?: string;
      assigneeType: TaskAssigneeType;
      assigneeEmail?: string;
      projectId?: string;
    },
    createdById: string
  ) {
    const normalizedDueDate = this.combineDueDateTime(data.dueDate, data.dueTime);

    return this.taskModel.create({
      data: {
        taskName: data.taskName,
        description: data.description,
        dueDate: normalizedDueDate,
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
      dueTime?: string;
      status?: string;
      completed?: boolean;
      assigneeType?: TaskAssigneeType;
      assigneeEmail?: string;
      projectId?: string;
    }
  ) {
    const existing = await this.taskModel.findUnique({
      where: { id },
      select: { dueDate: true },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const shouldUpdateDueDate = data.dueDate !== undefined || data.dueTime !== undefined;
    const normalizedDueDate = shouldUpdateDueDate
      ? this.combineDueDateTime(
          data.dueDate || existing.dueDate.toISOString().slice(0, 10),
          data.dueTime,
          existing.dueDate,
        )
      : undefined;

    return this.taskModel.update({
      where: { id },
      data: {
        ...(data.taskName != null && { taskName: data.taskName }),
        ...(data.description !== undefined && { description: data.description }),
        ...(normalizedDueDate && { dueDate: normalizedDueDate }),
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

  private combineDueDateTime(dueDate: string, dueTime?: string, fallbackDate?: Date): Date {
    const datePart = dueDate?.trim();
    if (!datePart) {
      throw new BadRequestException('Due date is required');
    }

    // If caller already sends a full datetime, keep it.
    if (datePart.includes('T')) {
      return new Date(datePart);
    }

    let timePart = dueTime?.trim();
    if (!timePart && fallbackDate) {
      const chicagoTime = this.getTimePartsInZone(
        fallbackDate,
        TasksService.CHICAGO_TIMEZONE,
      );
      const hh = String(chicagoTime.hour).padStart(2, '0');
      const mm = String(chicagoTime.minute).padStart(2, '0');
      timePart = `${hh}:${mm}`;
    }
    if (!timePart) {
      timePart = TasksService.DEFAULT_DUE_TIME;
    }

    const normalizedTime = /^\d{2}:\d{2}$/.test(timePart)
      ? timePart
      : TasksService.DEFAULT_DUE_TIME;

    return this.createDateInTimeZone(
      datePart,
      normalizedTime,
      TasksService.CHICAGO_TIMEZONE,
    );
  }

  private createDateInTimeZone(
    datePart: string,
    timePart: string,
    timeZone: string,
  ): Date {
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      throw new BadRequestException('Invalid due date or due time');
    }

    // Convert wall-clock time in target timezone -> UTC instant.
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    let utcTimestamp = localAsUtc;

    // Iterate because offset may change with DST transitions.
    for (let i = 0; i < 3; i += 1) {
      const offsetMinutes = this.getTimeZoneOffsetMinutes(
        new Date(utcTimestamp),
        timeZone,
      );
      const adjusted = localAsUtc - offsetMinutes * 60_000;
      if (adjusted === utcTimestamp) break;
      utcTimestamp = adjusted;
    }

    return new Date(utcTimestamp);
  }

  private getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
    const parts = this.getTimePartsInZone(date, timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    return (asUtc - date.getTime()) / 60_000;
  }

  private getTimePartsInZone(date: Date, timeZone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const raw = formatter.formatToParts(date);
    const read = (type: string) =>
      Number(raw.find((part) => part.type === type)?.value || '0');

    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
      hour: read('hour'),
      minute: read('minute'),
      second: read('second'),
    };
  }
}
