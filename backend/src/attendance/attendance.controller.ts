import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../common/roles.decorator';
import { GetUser } from '../common/get-user.decorator';

@Controller('attendance')
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('events')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async listEvents(@GetUser() user: any) {
    return this.attendanceService.listEvents(user);
  }

  @Post('events')
  @Roles('ADMIN', 'PM', 'PARTNER', 'EXECUTIVE')
  async createEvent(
    @Body()
    body: {
      title?: string;
      eventDate?: string;
      locationType?: 'IN_PERSON' | 'ONLINE';
      locationLabel?: string;
      latitude?: number;
      longitude?: number;
      geofenceRadiusMeters?: number;
      audienceScope?: 'TEAM' | 'GLOBAL';
      projectId?: string;
    },
    @GetUser() user: any,
  ) {
    return this.attendanceService.createEvent(user, body);
  }

  @Post('events/:id/code-window')
  @Roles('ADMIN', 'PM', 'PARTNER', 'EXECUTIVE')
  async openCodeWindow(@Param('id') id: string, @GetUser() user: any) {
    return this.attendanceService.openCodeWindow(id, user);
  }

  @Get('events/:id/attendances')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async listAttendances(@Param('id') id: string, @GetUser() user: any) {
    return this.attendanceService.listAttendances(id, user);
  }

  @Delete('events/:id')
  @Roles('ADMIN', 'PM', 'PARTNER', 'EXECUTIVE')
  async deleteEvent(@Param('id') id: string, @GetUser() user: any) {
    return this.attendanceService.deleteEvent(id, user);
  }

  @Post('events/:id/check-in')
  @Roles('ADMIN', 'PM', 'LC', 'CONSULTANT', 'PARTNER', 'EXECUTIVE')
  async checkIn(
    @Param('id') id: string,
    @Body()
    body: {
      method?: 'GEOFENCE' | 'CODE';
      geofenceVerified?: boolean;
      code?: string;
    },
    @GetUser() user: any,
  ) {
    return this.attendanceService.checkIn(id, user, body);
  }
}
