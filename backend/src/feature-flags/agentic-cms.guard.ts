import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
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
    const paths = [controllerPaths].flat().flatMap(controller =>
      [handlerPaths].flat().map(handler => `${controller}/${handler}`.replace(/\/+/g, '/').replace(/^\//, '')),
    );
    const protectedRoute = paths.some(path => /^agentic-cms(?:\/|$)/i.test(path));
    if (!protectedRoute) return true;

    // Registered globally: a new endpoint cannot forget its feature/auth guard.
    if (!this.flags.isAgenticCmsEnabled()) this.flags.assertAgenticCmsEnabledFor();
    // The single Agentic CMS authentication policy for every route under this
    // prefix (context, MCP, chat, status and future handlers): a verified
    // Microsoft token, active CMS enrollment and an active user. It runs here,
    // before legacy auth could resolve an email-only identity. Do not add a
    // second policy in feature controllers.
    if (!await this.auth.canActivate(context, { verifiedOnly: true })) throw new UnauthorizedException();
    const request = context.switchToHttp().getRequest<{ user?: { email?: string } }>();
    this.flags.assertAgenticCmsEnabledFor(request.user?.email);
    return true;
  }
}
