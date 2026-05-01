import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { DeliverablesController } from './deliverables/deliverables.controller';
import { DeliverablesService } from './deliverables/deliverables.service';
import { DeliverablesModule } from './deliverables/deliverables.module';
import { TasksModule } from './tasks/tasks.module';
import { SlideSubmissionsModule } from './slide-submissions/slide.submissions.module';
import { FeedbackModule } from './feedback/feedback.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AlumniModule } from './alumni/alumni.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    NotificationsModule,
    ProjectsModule,
    DeliverablesModule,
    TasksModule,
    SlideSubmissionsModule,
    FeedbackModule,
    AttendanceModule,
    AlumniModule,
  ],
  controllers: [DeliverablesController],
  providers: [DeliverablesService],
})
export class AppModule {}
