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
  BadRequestException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { AuthService } from '@/auth/auth.service';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
  ) {}

  private async getUserFromHeader(authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('No authorization header');
    }
    // Support "Bearer <email>" (e.g. from frontend) or plain email
    const email = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!email) {
      throw new UnauthorizedException('No user identifier in authorization');
    }
    const user = await this.authService.getUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  // Create project
  @Post()
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
    },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);

    // Teams UI allows PM, LC, and Admin to create/manage teams (projects),
    // so LC should also be allowed here.
    if (user.role !== 'ADMIN' && user.role !== 'PM' && user.role !== 'LC') {
      throw new ForbiddenException('Only Admins, PMs, and LCs can create projects');
    }

    return this.projectsService.create(body, user.id);
  }

  // Get all projects with param based filtering
  @Get()
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
  ) {
    const user = await this.getUserFromHeader(authorization);

    const parsedQuery = {
      status: query.status,
      search: query.search,
      pmId: query.pmId,
      userId: query.userId,
      includeMembers: query.includeMembers === 'true',
      includeDeliverables: query.includeDeliverables === 'true',
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 10,
    };

    // Consultants only see their assigned projects
    if (user.role === 'CONSULTANT') {
      return this.projectsService.findByMember(user.id, parsedQuery);
    }

    // PMs see their projects by default unless pmId is specified
    if (user.role === 'PM' && !query.pmId) {
      return this.projectsService.findAll({ ...parsedQuery, pmId: user.id });
    }

    // Admins see everything
    return this.projectsService.findAll(parsedQuery);
  }

  // Get single project
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Query()
    query: {
      includeMembers?: string;
      includeDeliverables?: string;
    },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const project = await this.projectsService.findOne(id, {
      includeMembers: query.includeMembers === 'true',
      includeDeliverables: query.includeDeliverables === 'true',
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check access permissions
    if (user.role === 'ADMIN') {
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
  ) {
    const user = await this.getUserFromHeader(authorization);
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Allow Admins, the owning PM, and LCs to update projects (teams)
    if (user.role !== 'ADMIN' && user.role !== 'LC' && project.pmId !== user.id) {
      throw new ForbiddenException('Only the PM, LC, or Admin can update this project');
    }

    return this.projectsService.update(id, body);
  }

  // Delete project
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Allow Admins, the owning PM, and LCs to delete projects
    if (user.role !== 'ADMIN' && user.role !== 'LC' && project.pmId !== user.id) {
      throw new ForbiddenException('Only the PM, LC, or Admin can delete this project');
    }

    return this.projectsService.remove(id);
  }

  // Add member to project (userId or email)
  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() body: { userId?: string; email?: string },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Allow Admins, the owning PM, and LCs to add members
    if (user.role !== 'ADMIN' && user.role !== 'LC' && project.pmId !== user.id) {
      throw new ForbiddenException('Only the PM, LC, or Admin can add members');
    }

    const identifier = body.email ?? body.userId;
    if (!identifier) {
      throw new BadRequestException('userId or email is required');
    }
    return this.projectsService.addMember(id, identifier);
  }

  // Remove member from project
  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const project = await this.projectsService.findOne(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Allow Admins, the owning PM, and LCs to remove members
    if (user.role !== 'ADMIN' && user.role !== 'LC' && project.pmId !== user.id) {
      throw new ForbiddenException('Only the PM, LC, or Admin can remove members');
    }

    return this.projectsService.removeMember(id, userId);
  }
}