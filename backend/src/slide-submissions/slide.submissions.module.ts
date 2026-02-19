import { Module } from '@nestjs/common';
import { SlideSubmissionsController } from './slide-submissions.controller';
import { SlideSubmissionsService } from './slide-submissions.service';
import { NotificationsModule } from '@/notifications/notifications.module';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [SlideSubmissionsController],
  providers: [SlideSubmissionsService],
  exports: [SlideSubmissionsService],
})
export class SlideSubmissionsModule {}
