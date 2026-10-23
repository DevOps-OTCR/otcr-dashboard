import { Controller, Get, Post, Query, Body, ForbiddenException, UseGuards, SetMetadata, Req, Header } from '@nestjs/common';
import { Request } from 'express';
import { Role, User } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { GetUser } from '../common/get-user.decorator';
import { normalizeEmail } from './access-policy';

@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('me')
  getCurrentUser(@GetUser() user: User) {
    return { success: true, user: { id: user.id, email: user.email, role: user.role } };
  }

  @Get('health')
  @SetMetadata('auth:public-health', true)
  health() {
    return { success: true, message: 'Auth service is running' };
  }

  @Get('access-status')
  @Header('Cache-Control', 'no-store')
  @SetMetadata('auth:identity-only', true)
  async accessStatus(@Req() request: Request & { identity: { email: string } }) {
    return { success: true, ...(await this.authService.getAccessStatus(request.identity.email)) };
  }

  @Get('role')
  @Header('Cache-Control', 'no-store')
  getRole(@GetUser() user: User) {
    return { success: true, role: user.role };
  }

  @Get('check-email')
  @Header('Cache-Control', 'no-store')
  @SetMetadata('auth:identity-only', true)
  async checkEmail(
    @Query('email') email: string | undefined,
    @Req() request: Request & { identity: { email: string } },
  ) {
    if (email !== undefined && (typeof email !== 'string' || normalizeEmail(email) !== request.identity.email)) {
      throw new ForbiddenException('You can only check your own access');
    }
    return { success: true, allowed: await this.authService.isEmailAllowed(request.identity.email) };
  }

  @Get('allowed-emails')
  async getAllowedEmails() {
    return { success: true, emails: await this.authService.getAllowedEmails() };
  }

  @Post('allowed-emails')
  async addAllowedEmail(@Body() body: { email?: string; role?: Role }, @GetUser() user: User) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only Admins can grant dashboard access');
    if (typeof body?.email !== 'string' || !body.email.trim()) return { success: false, message: 'Email is required' };
    return { success: true, email: await this.authService.addAllowedEmail(body.email, body.role ?? 'CONSULTANT') };
  }

  @Post('sync-user')
  async syncUser(@Body() body: { googleId?: string; email?: string; name?: string }, @GetUser() user: User) {
    if (body?.email !== undefined && (typeof body.email !== 'string' || normalizeEmail(body.email) !== normalizeEmail(user.email))) {
      throw new ForbiddenException('You can only sync your own profile');
    }
    // Client-supplied provider IDs are not identity proof and must not link accounts.
    const synced = await this.authService.syncUserWithDatabase(user.email, body?.name);
    return { success: true, user: { id: synced.id, email: synced.email, role: synced.role } };
  }
}
