import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { AgenticCmsGuard } from './agentic-cms.guard';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

@Module({
  imports: [AuthModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, { provide: APP_GUARD, useClass: AgenticCmsGuard }],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
