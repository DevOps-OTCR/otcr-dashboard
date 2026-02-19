import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthService } from '@/auth/auth.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly authService: AuthService,
  ) {}

  private async getUserFromHeader(authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('No authorization header');
    }

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
