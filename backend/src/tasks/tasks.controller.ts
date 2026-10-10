import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../common/roles.decorator';
import { GetUser } from '../common/get-user.decorator';
import type { User } from '@prisma/client';

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async findAll(
    @Query() query: { workstreamId?: string; includeCompleted?: string },
    @GetUser() user: User,
  ) {
    return this.tasksService.findForUser(user, {
      workstreamId: query.workstreamId,
      includeCompleted: query.includeCompleted !== 'false',
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async findOne(@Param('id') id: string, @GetUser() user: User) {
    return this.tasksService.findOne(id, user);
  }

  @Post()
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
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
    @GetUser() user: User,
  ) {
    return this.tasksService.create(body, user);
  }

  @Patch(':id')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
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
    @GetUser() user: User,
  ) {
    return this.tasksService.update(id, body as any, user);
  }

  @Delete(':id')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async remove(@Param('id') id: string, @GetUser() user: User) {
    return this.tasksService.remove(id, user);
  }
}
