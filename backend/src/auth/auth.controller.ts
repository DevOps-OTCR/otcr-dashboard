import { Controller, Get, Post, Headers, Query, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('me')
  async getCurrentUser(@Headers('authorization') authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('No authorization header');
    }

    // For NextAuth, we'll verify the session token
    // The frontend will send the session token
    const token = authorization.replace('Bearer ', '');

    // TODO: Verify NextAuth session token
    // For now, we'll use a simple approach - the frontend sends user email
    // In production, verify the NextAuth JWT token properly
    
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

  @Get('check-email')
  async checkEmail(@Query('email') email: string) {
    // This endpoint can be called without auth for sign-in checks
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

    // TODO: Verify NextAuth session token properly
    // For now, skip token verification for development
    // const token = authorization.replace('Bearer ', '');
    // await this.authService.verifyToken(token);

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
