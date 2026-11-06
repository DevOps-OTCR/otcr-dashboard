import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AgenticCmsController } from './agentic-cms.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CmsReadAccessService } from './authorization/cms-read-access.service';

@Module({
  imports: [FeatureFlagsModule, PrismaModule],
  controllers: [AgenticCmsController],
  providers: [CmsReadAccessService],
})
export class AgenticCmsModule {}
