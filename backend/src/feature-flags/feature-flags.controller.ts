import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('feature-flags')
@UseGuards(AuthGuard)
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getFlags(@Req() request: { user?: { email?: string } }) {
    return { agenticCms: this.flags.isAgenticCmsEnabledFor(request.user?.email) };
  }
}
