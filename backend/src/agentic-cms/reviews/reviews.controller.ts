import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { GetUser } from '../../common/get-user.decorator';
import { ProjectsService } from '../../projects/projects.service';
import { CmsReadAccessService, type CmsReader } from '../authorization/cms-read-access.service';
import {
  MAX_FOCUS_NOTE,
  ReviewJobsService,
  type Review,
  type ReviewLevel,
  type ReviewQueue,
} from './review-jobs.service';

class RequestReviewDto {
  @IsString()
  @MinLength(1)
  submissionId!: string;

  @IsIn(['BASIC', 'ADVANCED'])
  level!: ReviewLevel;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(MAX_FOCUS_NOTE)
  focusNote?: string;
}

// Every route sits behind the global AgenticCmsGuard (flag + sign-in + allowlist).
// Each route also checks project access for the signed-in user and whether the
// user may act as a reviewer (admin, LC, or the project's PM).
@Controller('agentic-cms/reviews')
export class ReviewsController {
  constructor(
    private readonly jobs: ReviewJobsService,
    private readonly projects: ProjectsService,
    private readonly access: CmsReadAccessService,
  ) {}

  @Get('projects/:projectId')
  async list(
    @Param('projectId') projectId: string,
    @GetUser() user: CmsReader,
  ): Promise<ReviewQueue> {
    await this.projects.assertProjectAccess(projectId, user);
    await this.access.assertContextWrite(user, projectId);
    return this.jobs.list(user, projectId);
  }

  @Post('projects/:projectId')
  async request(
    @Param('projectId') projectId: string,
    @Body() dto: RequestReviewDto,
    @GetUser() user: CmsReader,
  ): Promise<Review> {
    await this.projects.assertProjectAccess(projectId, user);
    await this.access.assertContextWrite(user, projectId);
    return this.jobs.request(user, projectId, {
      submissionId: dto.submissionId,
      level: dto.level,
      // Focus note is only meaningful for ADVANCED; ignore it for BASIC.
      ...(dto.level === 'ADVANCED' && dto.focusNote ? { focusNote: dto.focusNote } : {}),
    });
  }

  @Post('projects/:projectId/:reviewId/retry')
  @HttpCode(201)
  async retry(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @GetUser() user: CmsReader,
  ): Promise<Review> {
    await this.projects.assertProjectAccess(projectId, user);
    await this.access.assertContextWrite(user, projectId);
    return this.jobs.retry(user, projectId, reviewId);
  }

  @Post('projects/:projectId/:reviewId/post')
  @HttpCode(201)
  async post(
    @Param('projectId') projectId: string,
    @Param('reviewId') reviewId: string,
    @GetUser() user: CmsReader,
  ): Promise<Review> {
    await this.projects.assertProjectAccess(projectId, user);
    await this.access.assertContextWrite(user, projectId);
    return this.jobs.post(user, projectId, reviewId);
  }
}
