import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { getVerifiedUser } from '../common/utils/verify';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector, 
    private authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext, options?: { verifiedOnly: boolean }): Promise<boolean> {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
    
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = options?.verifiedOnly
      ? (typeof authorization === 'string' ? /^Bearer ([^\s]+)$/i.exec(authorization)?.[1] : undefined)
      : authorization?.replace('Bearer ', '');
    if (!token) return false;
    // Verified routes require a token before resolving CMS identity.
    if (options?.verifiedOnly && token.includes('@')) return false;
    let email: string;
    try {
      // Support both legacy "Bearer <email>" and modern "Bearer <access_token>".
      email = !options?.verifiedOnly && token.includes('@') ? token : await getVerifiedUser(token);
    } catch (error: any) {
      return false;
    }
    if (!email || typeof email !== 'string') return false;
    // CMS enrollment can be revoked while the User row remains active.
    if (options?.verifiedOnly && !await this.authService.isEmailAllowed(email)) return false;
    const user = await this.authService.getUserByEmail(email);
    if (!user || (options?.verifiedOnly && !user.active)) return false;
    request.user = user;
    if (!requiredRoles) return true;
    return requiredRoles.includes(user.role);
  }
}
