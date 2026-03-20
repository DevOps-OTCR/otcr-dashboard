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
import { ProjectsService } from './projects.service';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../common/roles.decorator';
import { GetUser } from '../common/get-user.decorator';
//TODO Implement GETUSER IN PARAMS?
//TODO IMPLEMENT AUTHGUARD IN ALL ROUTES WITH PROPER ROLES AND TEST
@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
    private readonly authGuard: AuthGuard
  ) {}

  @Post()
  @Roles('ADMIN', 'PM')
  async create(
    @Body()
    body: {
      name: string;
      description?: string;
      clientName?: string;
      startDate: string;
      endDate?: string;
      pmId?: string;
      memberIds?: string[];
      memberEmails?: string[];
    },
    @Headers('authorization') authorization: string,
    @GetUser() user: any
  ) {

    if (user.role !== 'ADMIN' && user.role !== 'PM') {
      throw new ForbiddenException('Only Admins and PMs can create projects');
    }

    return this.projectsService.create(body, user.id);
  }

  // Get all projects with param based filtering
  @Get()
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async findAll(
    @Query()
    query: {
      status?:  "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
      search?: string;
      pmId?: string;
      userId?: string;
      includeMembers?: string;
      includeDeliverables?: string;
      page?: string;
      limit?: string;
    },
    @Headers('authorization') authorization: string,
    @GetUser() user: any
  ) {

    const parsedQuery = {
      status: query.status,
      search: query.search,
      pmId: query.pmId,
      userId: query.userId,
      includeMembers: query.includeMembers === 'true',
      includeDeliverables: query.includeDeliverables === 'true',
      page: this.parsePositiveInt(query.page, 1),
      limit: this.parsePositiveInt(query.limit, 10),
    };

    if (user.role === 'CONSULTANT' || user.role === 'PARTNER') {
      return this.projectsService.findByMember(user.id, parsedQuery);
    }

    if (user.role === 'PM' && !query.pmId) {
      return this.projectsService.findAll({ ...parsedQuery, pmId: user.id });
    }

    return this.projectsService.findAll(parsedQuery);
  }

  @Get(':id/sprint-config')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async getSprintConfig(@Param('id') id: string, @GetUser() user: any) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.ensureProjectAccess(project, user);
    return this.projectsService.getSprintConfig(id);
  }

  @Patch(':id/sprint-config')
  @Roles('ADMIN', 'PM')
  async updateSprintConfig(
    @Param('id') id: string,
    @Body()
    body: {
      sprintStartDay?: string;
      initialSlideDueDay?: string;
      finalSlideDueDay?: string;
      defaultDueTime?: string;
      sprintTimezone?: string;
      autoGenerateSprints?: boolean;
    },
    @GetUser() user: any
  ) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (user.role !== 'ADMIN' && project.pmId !== user.id) {
      throw new ForbiddenException('Only the PM or Admin can update sprint settings');
    }

    return this.projectsService.updateSprintConfig(id, body);
  }

  @Get(':id/sprints')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async listSprints(@Param('id') id: string, @GetUser() user: any) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.ensureProjectAccess(project, user);
    return this.projectsService.listSprints(id);
  }

  @Post(':id/sprints/generate-next')
  @Roles('ADMIN', 'PM')
  async generateNextSprint(
    @Param('id') id: string,
    @Body() body: { startDate?: string },
    @GetUser() user: any,
  ) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (user.role !== 'ADMIN' && project.pmId !== user.id) {
      throw new ForbiddenException('Only the PM or Admin can generate sprints');
    }

    try {
      return await this.projectsService.generateNextSprint(id, body?.startDate);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      const message =
        error?.response?.message ??
        error?.message ??
        'Unable to generate a sprint right now.';
      throw new BadRequestException(Array.isArray(message) ? message.join(', ') : String(message));
    }
  }

  @Get(':id/sprints/:sprintId')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async getSprint(
    @Param('id') id: string,
    @Param('sprintId') sprintId: string,
    @GetUser() user: any
  ) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.ensureProjectAccess(project, user);
    const sprint = await this.projectsService.getSprint(id, sprintId);

    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    if (
      sprint.status !== 'RELEASED' &&
      user.role !== 'PM' &&
      user.role !== 'LC' &&
      user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('You do not have access to this sprint');
    }

    return sprint;
  }

  @Patch(':id/sprints/:sprintId/status')
  @Roles('ADMIN', 'PM', 'LC')
  async updateSprintStatus(
    @Param('id') id: string,
    @Param('sprintId') sprintId: string,
    @Body() body: { status: 'DRAFT' | 'RELEASED' },
    @GetUser() user: any
  ) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (user.role !== 'ADMIN' && user.role !== 'LC' && project.pmId !== user.id) {
      throw new ForbiddenException('Only PM, LC, or Admin can change sprint visibility');
    }

    if (body?.status !== 'DRAFT' && body?.status !== 'RELEASED') {
      throw new BadRequestException('Sprint status must be DRAFT or RELEASED');
    }

    return this.projectsService.updateSprintStatus(id, sprintId, body.status);
  }

  @Patch(':id/sprints/:sprintId/notes')
  @Roles('ADMIN', 'PM', 'LC')
  async updateSprintNotes(
    @Param('id') id: string,
    @Param('sprintId') sprintId: string,
    @Body() body: { generalNotes?: string },
    @GetUser() user: any,
  ) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (user.role !== 'ADMIN' && user.role !== 'LC' && project.pmId !== user.id) {
      throw new ForbiddenException('Only PM, LC, or Admin can update week notes');
    }

    return this.projectsService.updateSprintNotes(id, sprintId, body);
  }

  @Delete(':id/sprints/:sprintId')
  @Roles('ADMIN', 'PM', 'LC')
  async deleteSprint(
    @Param('id') id: string,
    @Param('sprintId') sprintId: string,
    @GetUser() user: any
  ) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (user.role !== 'ADMIN' && user.role !== 'LC' && project.pmId !== user.id) {
      throw new ForbiddenException('Only PM, LC, or Admin can delete sprints');
    }

    return this.projectsService.deleteSprint(id, sprintId);
  }

  // Get single project
  @Get(':id')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async findOne(
    @Param('id') id: string,
    @Query()
    query: {
      includeMembers?: string;
      includeDeliverables?: string;
    },
    @Headers('authorization') authorization: string,
    @GetUser() user: any
  ) {
    const project = await this.projectsService.findOne(id, {
      includeMembers: query.includeMembers === 'true',
      includeDeliverables: query.includeDeliverables === 'true',
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (user.role === 'ADMIN' || user.role === 'LC' || user.role === 'EXECUTIVE') {
      return project;
    }

    if (user.role === 'PM' && project.pmId === user.id) {
      return project;
    }

    const isMember = await this.projectsService.isMember(project.id, user.id);
    if (!isMember) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return project;
  }

  // Update project
  @Patch(':id')
  @Roles("ADMIN", "PM")
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      clientName?: string;
      startDate?: string;
      endDate?: string;
      status?: "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
    },
    @Headers('authorization') authorization: string,
    @GetUser() user: any
  ) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (user.role !== 'ADMIN' && project.pmId !== user.id) {
      throw new ForbiddenException(
        'Only the PM or Admin can update this project',
      );
    }

    return this.projectsService.update(id, body);
  }

  // Delete project
  @Delete(':id')
  @Roles("ADMIN")
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
    @GetUser() user: any
  ) {

    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Only Admins can delete projects');
    }

    return this.projectsService.remove(id);
  }

  // Add member to project
  @Post(':id/members')
  @Roles("ADMIN", "PM")
  async addMember(
    @Param('id') id: string,
    @Body() body: { userId?: string; email?: string },
    @Headers('authorization') authorization: string,
    @GetUser() user: any
  ) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (user.role !== 'ADMIN' && project.pmId !== user.id) {
      throw new ForbiddenException('Only the PM or Admin can add members');
    }

    return this.projectsService.addMember(id, body);
  }

  // Remove member from project
  @Delete(':id/members/:userId')
  @Roles("ADMIN", "PM")
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Headers('authorization') authorization: string,
    @GetUser() user: any
  ) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (user.role !== 'ADMIN' && project.pmId !== user.id) {
      throw new ForbiddenException('Only the PM or Admin can remove members');
    }

    return this.projectsService.removeMember(id, userId);
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async ensureProjectAccess(project: any, user: any) {
    if (user.role === 'ADMIN' || user.role === 'LC' || user.role === 'EXECUTIVE') {
      return;
    }

    if (user.role === 'PM' && project.pmId === user.id) {
      return;
    }

    const isMember = await this.projectsService.isMember(project.id, user.id);
    if (!isMember) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }
}
