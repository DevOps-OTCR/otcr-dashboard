import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AgenticCmsController } from './agentic-cms.controller';

@Module({
  imports: [FeatureFlagsModule],
  controllers: [AgenticCmsController],
})
export class AgenticCmsModule {}
