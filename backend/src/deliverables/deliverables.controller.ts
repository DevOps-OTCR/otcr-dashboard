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
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { DeliverablesService } from './deliverables.service';
import { ProjectsService } from '@/projects/projects.service';
import { AuthGuard } from '@/auth/auth.guard';
import { Roles } from '@/common/roles.decorator';
import { GetUser } from '@/common/get-user.decorator';

@Controller('deliverables')
@UseGuards(AuthGuard)
export class DeliverablesController {
  constructor(
    private readonly deliverablesService: DeliverablesService,
    private readonly projectsService: ProjectsService,
  ) {}

  // Create deliverable - PM or ADMIN
  @Post()
  @Roles('ADMIN', 'PM')
  async create(
    @Body() body: { projectId: string; title: string; description?: string; type: string; deadline: string; },
    @GetUser() user: any,
  ) {
    const project = await this.projectsService.findOne(body.projectId);
    if (!project) throw new NotFoundException('Project not found');

    if (user.role !== 'ADMIN' && project.pmId !== user.id) {
      throw new ForbiddenException('Only the PM or Admin can create deliverables');
    }

    return this.deliverablesService.create(body.projectId, body);
  }

  // Get deliverables with param based filtering
  @Get()
  @Roles('ADMIN', 'PM', 'CONSULTANT')
  async findAll(
    @Query() query: { projectId?: string; status?: string; type?: string; overdue?: string; upcoming?: string; userId?: string; page?: string; limit?: string; },
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

  @Get(':id')
  @Roles('ADMIN', 'PM', 'CONSULTANT')
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    const deliverable = await this.deliverablesService.findOne(id);
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    const isMember = await this.projectsService.isMember(deliverable.projectId, user.id);
    const project = await this.projectsService.findOne(deliverable.projectId);

    if (user.role !== 'ADMIN' && !isMember && project?.pmId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    return deliverable;
  }

  @Patch(':id')
  @Roles('ADMIN', 'PM')
  async update(@Param('id') id: string, @Body() body: any, @GetUser() user: any) {
    const deliverable = await this.deliverablesService.findOne(id);
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    const project = await this.projectsService.findOne(deliverable.projectId);
    if (user.role !== 'ADMIN' && project?.pmId !== user.id) {
      throw new ForbiddenException('Only the PM or Admin can update');
    }

    return this.deliverablesService.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(@Param('id') id: string, @GetUser() user: any) {
    const deliverable = await this.deliverablesService.findOne(id);
    if (!deliverable) throw new NotFoundException('Deliverable not found');

    return this.deliverablesService.remove(id);
  }
}