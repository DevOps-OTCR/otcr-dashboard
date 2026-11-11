import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { ProjectsModule } from '../projects/projects.module';
import { AgentService } from './agent/agent.service';
import { ConversationStore } from './agent/conversation.store';
import { AgenticCmsController } from './agentic-cms.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CmsReadAccessService } from './authorization/cms-read-access.service';
import { CmsReadService } from './reads/cms-read.service';
import { ReadCursorService } from './reads/read-cursor.service';
import { McpController } from './mcp/mcp.controller';
import { McpServerService } from './mcp/mcp-server.service';
import { ChatController } from './chat/chat.controller';
import { modelClientProvider } from './model/model.provider';
import { TavilySearchClient } from './search/tavily-search.client';
import { SkillLibrary } from './skills/skill-library';
import { LoadSkillTool } from './tools/load-skill.tool';
import { MockWorkstreamTool } from './tools/mock-workstream.tool';
import { ToolRegistry } from './tools/tool-registry';
import { WebSearchTool } from './tools/web-search.tool';

@Module({
  imports: [FeatureFlagsModule, PrismaModule, ProjectsModule],
  controllers: [AgenticCmsController, McpController, ChatController],
  providers: [
    CmsReadAccessService,
    CmsReadService,
    ReadCursorService,
    McpServerService,
    AgentService,
    ConversationStore,
    modelClientProvider,
    TavilySearchClient,
    SkillLibrary,
    ToolRegistry,
    WebSearchTool,
    LoadSkillTool,
    MockWorkstreamTool,
  ],
})
export class AgenticCmsModule {}
