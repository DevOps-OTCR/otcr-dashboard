import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AgenticCmsController } from './agentic-cms.controller';
import { ProjectsModule } from '../projects/projects.module';
import { AgentService } from './agent/agent.service';
import { ConversationStore } from './agent/conversation.store';
import { ChatController } from './chat/chat.controller';
import { modelClientProvider } from './model/model.provider';

@Module({
  imports: [FeatureFlagsModule, ProjectsModule],
  controllers: [AgenticCmsController, ChatController],
  providers: [AgentService, ConversationStore, modelClientProvider],
})
export class AgenticCmsModule {}
