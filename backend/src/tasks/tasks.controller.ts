import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { AuthService } from '../auth/auth.service';
import { getVerifiedUser } from '../common/utils/verify';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly authService: AuthService,
  ) {}

  private async getUserFromHeader(authorization: string) {
    if (!authorization) throw new UnauthorizedException('No authorization header');
    const raw = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!raw) throw new UnauthorizedException('No user identifier in authorization');

    // Support both legacy "Bearer <email>" and modern "Bearer <access_token>".
    const email = raw.includes('@') ? raw : await getVerifiedUser(raw);
    const user = await this.authService.getUserByEmail(email);
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  @Get()
  async findAll(
    @Query() query: { workstreamId?: string; includeCompleted?: string },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    return this.tasksService.findForUser(user, {
      workstreamId: query.workstreamId,
      includeCompleted: query.includeCompleted !== 'false',
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Headers('authorization') authorization: string) {
    await this.getUserFromHeader(authorization);
    return this.tasksService.findOne(id);
  }

  @Post()
  async create(
    @Body()
    body: {
      taskName: string;
      description?: string;
      dueDate: string;
      dueTime?: string;
      projectName: string;
      workstream: string;
      workstreamId?: string;
      assigneeType: 'PERSON' | 'ALL' | 'ALL_PMS' | 'ALL_TEAM';
      assigneeEmail?: string;
      projectId?: string;
    },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    return this.tasksService.create(body, user.id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      taskName?: string;
      description?: string;
      dueDate?: string;
      dueTime?: string;
      status?: string;
      completed?: boolean;
      assigneeType?: string;
      assigneeEmail?: string;
      projectId?: string;
    },
    @Headers('authorization') authorization: string,
  ) {
    await this.getUserFromHeader(authorization);
    return this.tasksService.update(id, body as any);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Headers('authorization') authorization: string) {
    await this.getUserFromHeader(authorization);
    return this.tasksService.remove(id);
  }
}
