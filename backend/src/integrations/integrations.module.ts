import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleCalendarService } from './google-calendar.service';
import { SlackService } from './slack.service';
import { SlackController } from './slack.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SlackController],
  providers: [SlackService, GoogleCalendarService],
  exports: [SlackService, GoogleCalendarService],
})
export class IntegrationsModule {}
