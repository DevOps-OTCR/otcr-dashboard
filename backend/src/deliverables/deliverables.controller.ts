import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { DeliverablesService } from './deliverables.service';
import { ProjectsService } from '../projects/projects.service';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../common/roles.decorator';
import { GetUser } from '../common/get-user.decorator';

@Controller('deliverables')
@UseGuards(AuthGuard)
export class DeliverablesController {
  constructor(
    private readonly deliverablesService: DeliverablesService,
    private readonly projectsService: ProjectsService,
  ) {}

  // Create deliverable - PM or ADMIN
  @Post()
  @Roles('ADMIN', 'PM', 'LC')
  async create(
    @Body() body: { projectId: string; sprintId?: string; title: string; description?: string; type: string; deadline: string; },
    @GetUser() user: any,
  ) {
    const project = await this.projectsService.findOne(body.projectId);
    if (!project) throw new NotFoundException('Project not found');

    if (user.role !== 'ADMIN' && user.role !== 'LC' && project.pmId !== user.id) {
      throw new ForbiddenException('Only PM, LC, or Admin can create deliverables');
    }

    return this.deliverablesService.create(body.projectId, body, user.id);
  }

  // Get deliverables with param based filtering
  @Get()
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async findAll(
    @Query() query: { projectId?: string; sprintId?: string; status?: string; type?: string; overdue?: string; upcoming?: string; userId?: string; page?: string; limit?: string; },
    @GetUser() user: any,
  ) {
    if (query.projectId) {
      const isMember = await this.projectsService.isMember(query.projectId, user.id);
      const project = await this.projectsService.findOne(query.projectId);
      
      if (user.role !== 'ADMIN' && !isMember && project?.pmId !== user.id) {
        throw new ForbiddenException('You do not have access to this project');
      }
    }

    const parsedQuery = {
      projectId: query.projectId,
      sprintId: query.sprintId,
      status: query.status,
      type: query.type,
      overdue: query.overdue === 'true',
      upcoming: query.upcoming ? parseInt(query.upcoming) : undefined,
      userId: query.userId || (user.role === 'CONSULTANT' ? user.id : undefined),
      releasedOnly: !['ADMIN', 'PM', 'LC'].includes(user.role),
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    };

    return this.deliverablesService.findAll(user, parsedQuery);
  }

  @Get(':id')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    const deliverable = (await this.deliverablesService.findOne(id)) as any;
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    const isMember = await this.projectsService.isMember(deliverable.projectId, user.id);
    const project = await this.projectsService.findOne(deliverable.projectId);

    if (user.role !== 'ADMIN' && !isMember && project?.pmId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    if (
      deliverable.sprint?.status !== 'RELEASED' &&
      !['ADMIN', 'PM', 'LC'].includes(user.role)
    ) {
      throw new ForbiddenException('Access denied');
    }

    return deliverable;
  }

  @Patch(':id')
  @Roles('ADMIN', 'PM', 'LC')
  async update(@Param('id') id: string, @Body() body: any, @GetUser() user: any) {
    const deliverable = (await this.deliverablesService.findOne(id)) as any;
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    const project = await this.projectsService.findOne(deliverable.projectId);
    if (user.role !== 'ADMIN' && user.role !== 'LC' && project?.pmId !== user.id) {
      throw new ForbiddenException('Only PM, LC, or Admin can update');
    }

    return this.deliverablesService.update(id, body);
  }

  @Patch(':id/deadline')
  @Roles('ADMIN', 'PM', 'LC')
  async updateDeadline(
    @Param('id') id: string,
    @Body() body: { deadline: string },
    @GetUser() user: any,
  ) {
    const deliverable = (await this.deliverablesService.findOne(id)) as any;
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    const project = await this.projectsService.findOne(deliverable.projectId);
    if (user.role !== 'ADMIN' && user.role !== 'LC' && project?.pmId !== user.id) {
      throw new ForbiddenException('Only PM, LC, or Admin can update deadlines');
    }

    if (!body?.deadline) {
      throw new BadRequestException('deadline is required');
    }

    return this.deliverablesService.updateDeadline(id, body.deadline);
  }

  @Patch(':id/assignment')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async updateAssignment(
    @Param('id') id: string,
    @Body() body: { assigned: boolean; assigneeId?: string },
    @GetUser() user: any,
  ) {
    const deliverable = (await this.deliverablesService.findOne(id)) as any;
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    const isMember = await this.projectsService.isMember(deliverable.projectId, user.id);
    const project = await this.projectsService.findOne(deliverable.projectId);
    const canManage = ['ADMIN', 'LC'].includes(user.role) || project?.pmId === user.id;

    if (!canManage && !isMember) {
      throw new ForbiddenException('Access denied');
    }

    if (deliverable.sprint?.status !== 'RELEASED' && !canManage) {
      throw new ForbiddenException('Draft deliverables cannot be assigned yet');
    }

    const targetUserId =
      body.assigneeId && canManage
        ? body.assigneeId
        : user.id;

    if (body.assigneeId && canManage) {
      const targetIsProjectPm = project?.pmId === targetUserId;
      const targetIsProjectMember = await this.projectsService.isMember(
        deliverable.projectId,
        targetUserId,
      );

      if (!targetIsProjectPm && !targetIsProjectMember) {
        throw new BadRequestException('Assignee must belong to this project');
      }
    }

    return this.deliverablesService.updateAssignment(id, targetUserId, Boolean(body.assigned));
  }

  @Patch(':id/completion')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async updateCompletion(
    @Param('id') id: string,
    @Body() body: { completed: boolean },
    @GetUser() user: any,
  ) {
    const deliverable = (await this.deliverablesService.findOne(id)) as any;
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    const isMember = await this.projectsService.isMember(deliverable.projectId, user.id);
    const project = await this.projectsService.findOne(deliverable.projectId);
    const canManage = ['ADMIN', 'LC'].includes(user.role) || project?.pmId === user.id;

    if (!canManage && !isMember) {
      throw new ForbiddenException('Access denied');
    }

    if (deliverable.sprint?.status !== 'RELEASED' && !canManage) {
      throw new ForbiddenException('Draft deliverables cannot be completed yet');
    }

    const assignmentUserIds = await this.deliverablesService.getAssignmentUserIds(id);

    if (!canManage && assignmentUserIds.length > 0 && !assignmentUserIds.includes(user.id)) {
      throw new ForbiddenException('Only the assigned consultant can update completion');
    }

    return this.deliverablesService.updateCompletion(id, Boolean(body?.completed));
  }

  @Post(':id/submissions')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async submitLink(
    @Param('id') id: string,
    @Body() body: { link: string },
    @GetUser() user: any,
  ) {
    const deliverable = (await this.deliverablesService.findOne(id)) as any;
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    const isMember = await this.projectsService.isMember(deliverable.projectId, user.id);
    const project = await this.projectsService.findOne(deliverable.projectId);
    const canManage = ['ADMIN', 'LC'].includes(user.role) || project?.pmId === user.id;

    if (!canManage && !isMember) {
      throw new ForbiddenException('Access denied');
    }

    if (deliverable.sprint?.status !== 'RELEASED' && !canManage) {
      throw new ForbiddenException('Draft deliverables cannot be submitted yet');
    }

    const assignmentUserIds = await this.deliverablesService.getAssignmentUserIds(id);

    if (!canManage && assignmentUserIds.length > 0 && !assignmentUserIds.includes(user.id)) {
      throw new ForbiddenException('Only assigned team members can submit this deliverable');
    }

    if (!body?.link) {
      throw new BadRequestException('link is required');
    }

    return this.deliverablesService.submitLink(id, user.id, body.link);
  }

  @Delete(':id')
  @Roles('ADMIN', 'PM', 'LC')
  async remove(@Param('id') id: string, @GetUser() user: any) {
    const deliverable = (await this.deliverablesService.findOne(id)) as any;
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    const project = await this.projectsService.findOne(deliverable.projectId);
    if (user.role !== 'ADMIN' && user.role !== 'LC' && project?.pmId !== user.id) {
      throw new ForbiddenException('Only PM, LC, or Admin can delete deliverables');
    }

    return this.deliverablesService.remove(id);
  }
}
