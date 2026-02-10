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
  ],
  controllers: [DeliverablesController],
  providers: [DeliverablesService],
})
export class AppModule {}
