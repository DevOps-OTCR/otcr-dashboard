import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { GithubIssuesClient } from './github-issues.client';
import { GithubIssueSyncService } from './github-issue-sync.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, GithubIssuesClient, GithubIssueSyncService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
