import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../auth/auth.guard';
import { FeatureFlagsService } from './feature-flags.service';

@Injectable()
export class AgenticCmsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
    private readonly auth: AuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const controllerPaths = this.reflector.get<string | string[]>(PATH_METADATA, context.getClass()) ?? '';
    const handlerPaths = this.reflector.get<string | string[]>(PATH_METADATA, context.getHandler()) ?? '';
    const protectedRoute = [controllerPaths].flat().some(controller =>
      [handlerPaths].flat().some(handler => /^agentic-cms(?:\/|$)/i.test(
        `${controller}/${handler}`.replace(/^\/+/, ''),
      )),
    );
    if (!protectedRoute) return true;

    // Registered globally: a new endpoint cannot forget its feature/auth guard.
    if (!this.flags.isAgenticCmsEnabled()) this.flags.assertAgenticCmsEnabledFor();
    if (!await this.auth.canActivate(context)) return false;
    const request = context.switchToHttp().getRequest<{ user?: { email?: string } }>();
    this.flags.assertAgenticCmsEnabledFor(request.user?.email);
    return true;
  }
}
