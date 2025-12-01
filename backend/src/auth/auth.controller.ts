import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('me')
  async getCurrentUser(@Headers('authorization') authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('No authorization header');
    }

    const token = authorization.replace('Bearer ', '');

    // Verify token and get clerk user ID
    const decoded = await this.authService.verifyToken(token);

    // Sync user with database and return
    const user = await this.authService.syncUserWithDatabase(decoded.sub);

    return {
      success: true,
      user,
    };
  }

  @Get('health')
  health() {
    return {
      success: true,
      message: 'Auth service is running',
    };
  }
}
