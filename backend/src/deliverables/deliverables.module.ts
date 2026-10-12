import { Module } from '@nestjs/common';
import { DeliverablesService } from './deliverables.service';
import { DeliverablesController } from './deliverables.controller';
import { SubmissionNotificationRetryService } from '../jobs/submission-notification-retry.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, ProjectsModule, NotificationsModule],
  controllers: [DeliverablesController],
  providers: [DeliverablesService, SubmissionNotificationRetryService],
  exports: [DeliverablesService],
})
export class DeliverablesModule {}
