import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { ProjectsModule } from '../projects/projects.module';
import { AgentService } from './agent/agent.service';
import { ConversationStore } from './agent/conversation.store';
import { AgenticCmsController } from './agentic-cms.controller';
import { ChatController } from './chat/chat.controller';
import { modelClientProvider } from './model/model.provider';
import { TavilySearchClient } from './search/tavily-search.client';
import { SkillLibrary } from './skills/skill-library';
import { LoadSkillTool } from './tools/load-skill.tool';
import { MockWorkstreamTool } from './tools/mock-workstream.tool';
import { ToolRegistry } from './tools/tool-registry';
import { WebSearchTool } from './tools/web-search.tool';

@Module({
  imports: [FeatureFlagsModule, ProjectsModule],
  controllers: [AgenticCmsController, ChatController],
  providers: [
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
