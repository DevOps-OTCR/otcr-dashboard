import { Controller, Get, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  async me(@Headers('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    const user = await this.authService.verifyToken(token);
    return { user };
  }
}
