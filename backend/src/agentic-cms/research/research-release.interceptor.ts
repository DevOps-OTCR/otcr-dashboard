import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { concatMap } from 'rxjs';
import { AuthGuard } from '../../auth/auth.guard';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { ProjectsController } from '../../projects/projects.controller';
import { CmsReader } from '../authorization/cms-read-access.service';
import { ResearchPreparationService } from './research-preparation.service';

@Injectable()
export class ResearchReleaseInterceptor implements NestInterceptor {
  constructor(private readonly flags: FeatureFlagsService, private readonly auth: AuthGuard, private readonly research: ResearchPreparationService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    // Observe only the existing release handler, after it succeeds. No feature
    // import, new authentication rule or provider switch is added to CMS pages.
    if (context.getClass() !== ProjectsController || context.getHandler() !== ProjectsController.prototype.updateSprintStatus) return next.handle();
    const req = context.switchToHttp().getRequest<{
      body?: { status?: string }; params: { id: string; sprintId: string }; user?: CmsReader;
    }>();
    return next.handle().pipe(concatMap(async (response: unknown) => {
      if (req.body?.status !== 'RELEASED') return response;
      try {
        this.flags.assertAgenticCmsEnabledFor(req.user?.email);
        // Reuse the single verified-only policy; legacy email credentials can
        // still release an ordinary week, but cannot start research operations.
        if (!await this.auth.canActivate(context, { verifiedOnly: true })) return response;
        this.flags.assertAgenticCmsEnabledFor(req.user?.email);
        await this.research.prepareReleasedWorkstream(req.user, req.params.id, req.params.sprintId);
      } catch {
        // Preparation is optional to the ordinary release transaction. Failures
        // are recoverable through the gated status/retry API, never response logs.
      }
      return response;
    }));
  }
}
