import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SlackService } from './slack.service';
import { SlackController } from './slack.controller';

@Module({
  imports: [AuthModule],
  controllers: [SlackController],
  providers: [SlackService],
  exports: [SlackService],
})
export class IntegrationsModule {}
