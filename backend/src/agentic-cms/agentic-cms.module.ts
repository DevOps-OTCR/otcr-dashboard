import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AgenticCmsController } from './agentic-cms.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CmsReadAccessService } from './authorization/cms-read-access.service';
import { CmsReadService } from './reads/cms-read.service';
import { ReadCursorService } from './reads/read-cursor.service';
import { McpController } from './mcp/mcp.controller';
import { McpServerService } from './mcp/mcp-server.service';

@Module({
  imports: [FeatureFlagsModule, PrismaModule],
  controllers: [AgenticCmsController, McpController],
  providers: [CmsReadAccessService, CmsReadService, ReadCursorService, McpServerService],
})
export class AgenticCmsModule {}
