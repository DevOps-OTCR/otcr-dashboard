import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleCalendarService } from './google-calendar.service';
import { SlackService } from './slack.service';
import { SlackController } from './slack.controller';
import { SlackRoleSuggestionsService } from './slack-role-suggestions.service';
import { SlackRoleSuggestionsController } from './slack-role-suggestions.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SlackController, SlackRoleSuggestionsController],
  providers: [SlackService, GoogleCalendarService, SlackRoleSuggestionsService],
  exports: [SlackService, GoogleCalendarService],
})
export class IntegrationsModule {}
