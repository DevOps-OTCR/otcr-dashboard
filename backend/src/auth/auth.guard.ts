import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { getVerifiedUser } from '@/common/utils/verify';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector, 
    private authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
    
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) return false;
    let email: string;
    try {
      // Support both legacy "Bearer <email>" and modern "Bearer <access_token>".
      email = token.includes('@') ? token : await getVerifiedUser(token);
    } catch (error: any) {
      return false;
    }
    if (!email || typeof email !== 'string') return false;
    const user = await this.authService.getUserByEmail(email);
    if (!user) return false;
    request.user = user;
    if (!requiredRoles) return true;
    return requiredRoles.includes(user.role);
  }
}
