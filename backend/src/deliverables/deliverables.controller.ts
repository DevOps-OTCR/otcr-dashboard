import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DeliverablesService } from './deliverables.service';
import { AuthService } from '@/auth/auth.service';
import { ProjectsService } from '@/projects/projects.service';

@Controller('deliverables')
export class DeliverablesController {
  constructor(
    private readonly deliverablesService: DeliverablesService,
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
  ) {}

  // Helper method to get user from authorization header
  private async getUserFromHeader(authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('No authorization header');
    }

    const user = await this.authService.getUserByEmail(authorization);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  // Check if user can access project
  private async checkProjectAccess(projectId: string, user: any) {
    const project = await this.projectsService.findOne(projectId);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Admin can access all
    if (user.role === 'ADMIN') return project;

    // PM can access their projects
    if (user.role === 'PM' && project.pmId === user.id) return project;

    // Check if user is a member
    const isMember = await this.projectsService.isMember(projectId, user.id);
    if (!isMember) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return project;
  }

  // Create deliverable - PM or ADMIN
  @Post()
  async create(
    @Body()
    body: {
      projectId: string;
      title: string;
      description?: string;
      type: string;
      deadline: string;
    },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const project = await this.checkProjectAccess(body.projectId, user);

    // Only PM of project or ADMIN can create deliverables
    if (user.role !== 'ADMIN' && project.pmId !== user.id) {
      throw new ForbiddenException(
        'Only the PM or Admin can create deliverables',
      );
    }

    return this.deliverablesService.create(body.projectId, body);
  }

  // Get deliverables with param based filtering
  @Get()
  async findAll(
    @Query()
    query: {
      projectId?: string;
      status?: string;
      type?: string;
      overdue?: string;
      upcoming?: string; 
      userId?: string; 
      page?: string;
      limit?: string;
    },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);

    // If projectId is specified, check access
    if (query.projectId) {
      await this.checkProjectAccess(query.projectId, user);
    }

    // Parse query params
    const parsedQuery = {
      projectId: query.projectId,
      status: query.status,
      type: query.type,
      overdue: query.overdue === 'true',
      upcoming: query.upcoming ? parseInt(query.upcoming) : undefined,
      userId: query.userId || (user.role === 'CONSULTANT' ? user.id : undefined),
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    };

    return this.deliverablesService.findAll(user, parsedQuery);
  }

  // Get single deliverable
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const deliverable = await this.deliverablesService.findOne(id);

    if (!deliverable) {
      throw new NotFoundException('Deliverable not found');
    }

    await this.checkProjectAccess(deliverable.projectId, user);

    return deliverable;
  }

  // Update deliverable: PM or ADMIN
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      type?: string;
      deadline?: string;
      status?: string;
    },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const deliverable = await this.deliverablesService.findOne(id);

    if (!deliverable) {
      throw new NotFoundException('Deliverable not found');
    }

    const project = await this.checkProjectAccess(deliverable.projectId, user);

    // Only PM of project or ADMIN can update
    if (user.role !== 'ADMIN' && project.pmId !== user.id) {
      throw new ForbiddenException(
        'Only the PM or Admin can update deliverables',
      );
    }

    return this.deliverablesService.update(id, body);
  }

  // Delete deliverable: PM or ADMIN
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const deliverable = await this.deliverablesService.findOne(id);

    if (!deliverable) {
      throw new NotFoundException('Deliverable not found');
    }

    const project = await this.checkProjectAccess(deliverable.projectId, user);

    // Only PM of project or ADMIN can delete
    if (user.role !== 'ADMIN' && project.pmId !== user.id) {
      throw new ForbiddenException(
        'Only the PM or Admin can delete deliverables',
      );
    }

    return this.deliverablesService.remove(id);
  }
}