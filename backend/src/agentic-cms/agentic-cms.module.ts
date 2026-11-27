import { ResearchChatTool } from './research/research-chat.tool';
import { ResearchEditController } from './research/research-edit.controller';
import { ResearchEditService } from './research/research-edit.service';
import { ResearchFindingsController } from './research/research-findings.controller';
import { ResearchFindingsService } from './research/research-findings.service';
import { TavilyExtractClient } from './search/tavily-extract.client';
import { ResearchFrameworkController } from './research/research-framework.controller';
import { ResearchFrameworkService } from './research/research-framework.service';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
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
import { CmsReadTools } from './tools/cms-read.tools';
import { LoadSkillTool } from './tools/load-skill.tool';
import { ToolRegistry } from './tools/tool-registry';
import { WebSearchTool } from './tools/web-search.tool';
import { ResearchAccessService } from './research/research-access.service';
import { CmsResearchDocumentAdapter, ResearchDocumentAdapter } from './research/research-document.adapter';
import { ResearchWorkspaceController } from './research/research-workspace.controller';
import { ResearchWorkspaceService } from './research/research-workspace.service';
import { ResearchPreparationService } from './research/research-preparation.service';
import { ResearchReleaseInterceptor } from './research/research-release.interceptor';
import { PastDataRetrievalService } from './research/past-data-retrieval.service';
import { ResearchPastDataService } from './research/research-past-data.service';
import { ResearchPastDataController } from './research/research-past-data.controller';

@Module({
  imports: [FeatureFlagsModule, PrismaModule, ProjectsModule, AuthModule],
  controllers: [ResearchEditController, ResearchFindingsController, ResearchFrameworkController, AgenticCmsController, McpController, ChatController, ResearchWorkspaceController, ResearchPastDataController],
  providers: [
    ResearchEditService,
    ResearchChatTool,
    ResearchFindingsService,
    TavilyExtractClient,
    ResearchFrameworkService,
    PastDataRetrievalService,
    ResearchPastDataService,
    ResearchPreparationService,
    { provide: APP_INTERCEPTOR, useClass: ResearchReleaseInterceptor },
    ResearchAccessService,
    ResearchWorkspaceService,
    { provide: ResearchDocumentAdapter, useClass: CmsResearchDocumentAdapter },
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
    CmsReadTools,
  ],
})
export class AgenticCmsModule {}
