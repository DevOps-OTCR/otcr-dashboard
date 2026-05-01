import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../common/roles.decorator';
import { GetUser } from '../common/get-user.decorator';
import { When2MeetService } from './when2meet.service';

@Controller('when2meet')
@UseGuards(AuthGuard)
export class When2MeetController {
  constructor(private readonly when2MeetService: When2MeetService) {}

  @Post('polls')
  @Roles('ADMIN', 'PM', 'PARTNER', 'EXECUTIVE')
  createPoll(
    @GetUser() user: any,
    @Body()
    body: {
      projectId?: string;
      title?: string;
      gridFirstDate?: string;
      gridLastDate?: string;
      slotStart?: string;
      slotEnd?: string;
    },
  ) {
    return this.when2MeetService.createPoll(user, body);
  }

  @Get('polls')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  listPolls(@GetUser() user: any, @Query('projectId') projectId: string) {
    return this.when2MeetService.listPolls(user, projectId);
  }

  @Get('polls/:id')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  getPoll(@GetUser() user: any, @Param('id') id: string) {
    return this.when2MeetService.getPoll(user, id);
  }

  @Delete('polls/:id')
  @Roles('ADMIN', 'PM', 'PARTNER', 'EXECUTIVE')
  deletePoll(@GetUser() user: any, @Param('id') id: string) {
    return this.when2MeetService.deletePoll(user, id);
  }

  @Put('polls/:id/my-availability')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  saveMyAvailability(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() body: { slots?: number[] },
  ) {
    return this.when2MeetService.saveMyAvailability(user, id, body);
  }
}
