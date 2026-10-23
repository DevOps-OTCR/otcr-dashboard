import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthService } from '../auth/auth.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly authService: AuthService,
  ) {}

  private async getUserFromHeader(authorization: string) {
    return this.authService.getUserFromAuthorization(authorization);
  }

  @Post('bell-mirror')
  async mirrorBellNotification(
    @Headers('authorization') authorization: string,
    @Body()
    body: {
      assigneeEmail?: string;
      title?: string;
      message?: string;
      type?: string;
      taskId?: string;
      taskTitle?: string;
    },
  ) {
    await this.getUserFromHeader(authorization);

    const assigneeEmail = body?.assigneeEmail?.trim();
    const title = body?.title?.trim();
    const message = body?.message?.trim();

    if (!assigneeEmail || !title || !message) {
      throw new BadRequestException('assigneeEmail, title, and message are required');
    }

    const targetUser = await this.authService.findApprovedUserByEmail(assigneeEmail);
    if (!targetUser) {
      // Bell notification can still exist locally even if no backend user exists.
      return { queued: false, reason: 'target_user_not_found' };
    }

    await this.notificationsService.queueBellMirrorNotification({
      userId: targetUser.id,
      sourceType: body?.type,
      title,
      message,
      taskId: body?.taskId,
      taskTitle: body?.taskTitle,
    });

    return { queued: true };
  }

  @Get('my')
  async getMyNotifications(
    @Headers('authorization') authorization: string,
    @Query('limit') limitRaw?: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 30;

    return this.notificationsService.getNotificationsForUser(user.id, limit);
  }
}
