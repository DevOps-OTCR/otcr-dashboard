import { Controller, Get, Post, Headers, Query, Body, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { GetUser } from '@/common/get-user.decorator';

@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('me')
  async getCurrentUser(@Headers('authorization') authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('No authorization header');
    }
    
    return {
      success: true,
      message: 'Use session-based auth from NextAuth',
    };
  }

  @Get('health')
  health() {
    return {
      success: true,
      message: 'Auth service is running',
    };
  }

  @Get('role')
  async getRole(@GetUser() user: any) {
    try {
      const role = await this.authService.getRoleByEmail(user.email);
      return { success: true, role: role ?? 'CONSULTANT' };
    } catch (error) {
      console.error('Error fetching role:', error);
      return { success: false, role: null, message: 'Error fetching role' };
    }
  }

  @Get('check-email')
  async checkEmail(@Query('email') email: string) {
    if (!email) {
      return {
        success: false,
        allowed: false,
        message: 'Email is required',
      };
    }
    
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const isAllowed = await this.authService.isEmailAllowed(normalizedEmail);
      
      // Log for debugging
      console.log(`Email check for ${normalizedEmail}: ${isAllowed ? 'ALLOWED' : 'DENIED'}`);
      
      return {
        success: true,
        allowed: isAllowed,
      };
    } catch (error) {
      console.error('Error checking email:', error);
      return {
        success: false,
        allowed: false,
        message: 'Error checking email',
      };
    }
  }

  @Get('allowed-emails')
  async getAllowedEmails(@Headers('authorization') authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('No authorization header');
    }

    const emails = await this.authService.getAllowedEmails();
    return {
      success: true,
      emails,
    };
  }

  @Post('sync-user')
  async syncUser(@Body() body: { googleId: string; email: string; name?: string }) {
    // This endpoint can be called during sign-in to sync user with database
    if (!body.email || !body.googleId) {
      return {
        success: false,
        message: 'Email and googleId are required',
      };
    }

    try {
      const user = await this.authService.syncUserWithDatabase(
        body.googleId,
        body.email,
        body.name
      );
      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      console.error('Error syncing user:', error);
      return {
        success: false,
        message: 'Error syncing user',
      };
    }
  }
}
