import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { DeadlineSchedulerService } from '../jobs/deadline-scheduler.service';
import { IntegrationsModule } from '@/integrations/integrations.module';
import { NotificationsController } from './notifications.controller';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [IntegrationsModule, AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    DeadlineSchedulerService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
