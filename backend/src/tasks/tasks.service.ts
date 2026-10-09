import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '@prisma/client';
import { GoogleCalendarService } from '../integrations/google-calendar.service';

type TaskAssigneeType = 'PERSON' | 'ALL' | 'ALL_PMS' | 'ALL_TEAM';

type TaskAccess = {
  createdById: string;
  assigneeType: string;
  assigneeEmail?: string | null;
  projectId?: string | null;
};

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private googleCalendarService: GoogleCalendarService,
  ) {}
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

  private async hasProjectAccess(projectId: string, user: Pick<User, 'id' | 'role'>, allowAdmin = true): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { pmId: true },
    });
    if (!project) return false;
    if ((allowAdmin && user.role === 'ADMIN') || project.pmId === user.id) return true;
    return !!await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, leftAt: null },
    });
  }

  private async assertTaskAccess(task: TaskAccess, user: User, write = false): Promise<void> {
    if (user.role === 'ADMIN' || task.createdById === user.id) return;
    const personallyAssigned = task.assigneeType === 'PERSON' &&
      task.assigneeEmail?.toLowerCase() === user.email.toLowerCase();
    if (personallyAssigned) return;

    // Broadcast recipients may read a task, but cannot edit it merely because
    // it appears in their action center. PMs/LCs manage only their own teams.
    if (!write && await this.taskAppliesToUser(task, user)) return;
    const canManageTeam = user.role === 'PM' || user.role === 'LC';
    if (task.projectId && (!write || canManageTeam) && await this.hasProjectAccess(task.projectId, user)) return;
    throw new ForbiddenException('You do not have access to this task');
  }

  private async assertAssignmentAllowed(
    assignment: Omit<TaskAccess, 'createdById'>,
    user: User,
  ): Promise<void> {
    const { assigneeType, assigneeEmail, projectId } = assignment;
    if (!['PERSON', 'ALL', 'ALL_PMS', 'ALL_TEAM'].includes(assigneeType)) {
      throw new BadRequestException('Invalid task assignment type');
    }
    if (assigneeEmail != null && typeof assigneeEmail !== 'string') {
      throw new BadRequestException('Invalid assignee');
    }
    if (projectId != null && (typeof projectId !== 'string' || !projectId.trim())) {
      throw new BadRequestException('Invalid project');
    }
    if (projectId && !await this.hasProjectAccess(projectId, user)) {
      throw new ForbiddenException('You do not have access to this project');
    }
    if (assigneeType === 'ALL' || assigneeType === 'ALL_PMS') {
      if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can assign organization-wide tasks');
      return;
    }
    if (assigneeType === 'ALL_TEAM') {
      if (!projectId) throw new BadRequestException('Team tasks require a project');
      if (!['ADMIN', 'PM', 'LC'].includes(user.role)) {
        throw new ForbiddenException('Only team managers can assign team tasks');
      }
      return;
    }
    if (typeof assigneeEmail !== 'string' || !assigneeEmail.trim()) {
      throw new BadRequestException('Personal tasks require an assignee');
    }
    if (assigneeEmail.trim().toLowerCase() === user.email.toLowerCase()) return;
    if (user.role !== 'ADMIN' && (!projectId || !['PM', 'LC'].includes(user.role))) {
      throw new ForbiddenException('You can only assign your own tasks');
    }
    const assignee = await this.prisma.user.findFirst({
      where: { email: { equals: assigneeEmail.trim(), mode: 'insensitive' } },
    });
    if (!assignee || (user.role !== 'ADMIN' && !await this.hasProjectAccess(projectId!, assignee, false))) {
      throw new ForbiddenException('Assignee must belong to this project');
    }
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

    const withSubmissionState = await this.attachConsultantSubmissionState(filtered, user.id);

    if (query.includeCompleted === false) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return withSubmissionState.filter(
        (t) => !t.completed || new Date(t.dueDate) >= today,
      );
    }
    return withSubmissionState;
  }

  private async attachConsultantSubmissionState<
    T extends {
      id: string;
      description?: string | null;
      completed: boolean;
      dueDate: Date;
    }
  >(tasks: T[], userId: string): Promise<Array<T & { consultantTaskStatus: string | null }>> {
    const deliverableByTaskId = new Map<string, string>();
    const deliverableIds = new Set<string>();

    for (const task of tasks) {
      const deliverableId = this.extractSlideDeliverableId(task.description ?? null);
      if (!deliverableId) continue;
      deliverableByTaskId.set(task.id, deliverableId);
      deliverableIds.add(deliverableId);
    }

    if (deliverableIds.size === 0) {
      return tasks.map((task) => ({
        ...task,
        consultantTaskStatus: null as string | null,
      }));
    }

    const submissions = await this.prisma.submission.findMany({
      where: {
        userId,
        deliverableId: { in: Array.from(deliverableIds) },
      },
      select: {
        deliverableId: true,
        status: true,
        reviewedAt: true,
        submittedAt: true,
      },
      orderBy: [{ submittedAt: 'desc' }],
    });

    const latestByDeliverable = new Map<
      string,
      {
        status: string;
        reviewedAt: Date | null;
      }
    >();

    for (const submission of submissions) {
      if (!latestByDeliverable.has(submission.deliverableId)) {
        latestByDeliverable.set(submission.deliverableId, {
          status: submission.status,
          reviewedAt: submission.reviewedAt,
        });
      }
    }

    return tasks.map((task) => {
      const deliverableId = deliverableByTaskId.get(task.id);
      if (!deliverableId) {
        return {
          ...task,
          consultantTaskStatus: null as string | null,
        };
      }

      const latest = latestByDeliverable.get(deliverableId);
      return {
        ...task,
        consultantTaskStatus: this.mapConsultantTaskStatus(latest),
      };
    });
  }

  private extractSlideDeliverableId(description?: string | null): string | null {
    if (!description) return null;
    const match = description.match(/\[\[SLIDE_DELIVERABLE_ID:([^\]]+)\]\]/);
    return match?.[1] ?? null;
  }

  private mapConsultantTaskStatus(
    submission?: { status: string; reviewedAt: Date | null } | null,
  ): string | null {
    if (!submission) return null;
    if (submission.status === 'APPROVED') return 'APPROVED';
    if (submission.status === 'REQUIRES_RESUBMISSION' || submission.status === 'REJECTED') {
      return 'REVISION_REQUESTED';
    }
    if (submission.status === 'PENDING_REVIEW') {
      return submission.reviewedAt ? 'COMMENTS_ADDED' : 'SUBMITTED';
    }
    return submission.status;
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
    user: User
  ) {
    await this.assertAssignmentAllowed(data, user);
    const normalizedDueDate = this.combineDueDateTime(data.dueDate, data.dueTime);

    const task = await this.taskModel.create({
      data: {
        taskName: data.taskName,
        description: data.description,
        dueDate: normalizedDueDate,
        projectName: data.projectName,
        workstream: data.workstream,
        workstreamId: data.workstreamId,
        assigneeType: data.assigneeType,
        assigneeEmail: data.assigneeEmail?.trim(),
        projectId: data.projectId,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    return this.syncTaskCalendarFields(task);
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
    },
    user: User,
  ) {
    const existing = await this.taskModel.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }
    await this.assertTaskAccess(existing, user, true);
    if (data.assigneeType !== undefined || data.assigneeEmail !== undefined || data.projectId !== undefined) {
      await this.assertAssignmentAllowed({ ...existing, ...data }, user);
    }

    const shouldUpdateDueDate = data.dueDate !== undefined || data.dueTime !== undefined;
    const normalizedDueDate = shouldUpdateDueDate
      ? this.combineDueDateTime(
          data.dueDate || existing.dueDate.toISOString().slice(0, 10),
          data.dueTime,
          existing.dueDate,
        )
      : undefined;

    const updatedTask = await this.taskModel.update({
      where: { id },
      data: {
        ...(data.taskName != null && { taskName: data.taskName }),
        ...(data.description !== undefined && { description: data.description }),
        ...(normalizedDueDate && { dueDate: normalizedDueDate }),
        ...(data.status != null && { status: data.status as any }),
        ...(data.completed !== undefined && { completed: data.completed }),
        ...(data.assigneeType != null && { assigneeType: data.assigneeType }),
        ...(data.assigneeEmail !== undefined && { assigneeEmail: data.assigneeEmail?.trim() }),
        ...(data.projectId !== undefined && { projectId: data.projectId }),
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    return this.syncTaskCalendarFields(updatedTask);
  }

  async remove(id: string, user: User) {
    const existing = await this.taskModel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.assertTaskAccess(existing, user, true);
    await this.googleCalendarService.removeTaskEvent(existing);
    return this.taskModel.delete({ where: { id } });
  }

  async findOne(id: string, user: User) {
    const task = await this.taskModel.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertTaskAccess(task, user);
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

  private async syncTaskCalendarFields<T extends {
    id: string;
    taskName: string;
    description?: string | null;
    dueDate: Date;
    projectName: string;
    workstream: string;
    assigneeType: TaskAssigneeType;
    projectId?: string | null;
    googleCalendarEventId?: string | null;
    googleCalendarId?: string | null;
  }>(task: T): Promise<T> {
    const syncState = await this.googleCalendarService.syncTask(task);
    const nextEventId = syncState.googleCalendarEventId ?? null;
    const nextCalendarId = syncState.googleCalendarId ?? null;

    if (
      (task.googleCalendarEventId ?? null) === nextEventId &&
      (task.googleCalendarId ?? null) === nextCalendarId
    ) {
      return task;
    }

    const updated = await this.taskModel.update({
      where: { id: task.id },
      data: {
        googleCalendarEventId: nextEventId,
        googleCalendarId: nextCalendarId,
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    return updated as T;
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
