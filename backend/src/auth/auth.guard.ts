import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { getVerifiedEmail } from './verified-identity';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.get<boolean>('auth:public-health', context.getHandler())) return true;
    const request = context.switchToHttp().getRequest();
    const email = await getVerifiedEmail(request.headers.authorization);
    request.identity = { email };
    // This route exposes only the verified caller's status, never a CMS User.
    if (this.reflector.get<boolean>('auth:identity-only', context.getHandler())) return true;
    const user = await this.authService.getUserByEmail(email);
    if (!user) return false;
    request.user = user;
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(), context.getClass(),
    ]);
    return !requiredRoles || requiredRoles.includes(user.role);
  }
}
