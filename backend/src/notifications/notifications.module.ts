import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { SlackService } from '../integrations/slack.service';
import { EmailService } from '../integrations/email.service';
import { DeadlineSchedulerService } from '../jobs/deadline-scheduler.service';

@Module({
  providers: [
    NotificationsService,
    NotificationsProcessor,
    SlackService,
    EmailService,
    DeadlineSchedulerService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
