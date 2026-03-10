import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SlideSubmissionsService } from './slide-submissions.service';
import { AuthService } from '../auth/auth.service';
import { getVerifiedUser } from '../common/utils/verify';

@Controller('slide-submissions')
export class SlideSubmissionsController {
  constructor(
    private readonly slideSubmissionsService: SlideSubmissionsService,
    private readonly authService: AuthService,
  ) {}

  private async getUserFromHeader(authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('No authorization header');
    }

    const raw = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!raw) {
      throw new UnauthorizedException('No user identifier in authorization');
    }
    const email = raw.includes('@') ? raw : await getVerifiedUser(raw);

    const user = await this.authService.getUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  @Post()
  async submit(
    @Body()
    body: {
      deliverableId?: string;
      taskId?: string;
      presentationLink: string;
      fileName?: string;
      mimeType?: string;
    },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);

    if (
      user.role !== 'CONSULTANT' &&
      user.role !== 'LC' &&
      user.role !== 'PM' &&
      user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Only consultants, LCs, PMs, or admins can submit slides or whitepapers');
    }

    const deliverableId = body.deliverableId || body.taskId;
    if (!deliverableId) {
      throw new BadRequestException('deliverableId is required');
    }

    return this.slideSubmissionsService.submitSlide(
      user.id,
      deliverableId,
      body.presentationLink,
      body.fileName,
      body.mimeType,
    );
  }

  @Get('my')
  async getMySubmissions(@Headers('authorization') authorization: string) {
    const user = await this.getUserFromHeader(authorization);

    if (
      user.role !== 'CONSULTANT' &&
      user.role !== 'LC' &&
      user.role !== 'PM' &&
      user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException(
        'Only consultants, LCs, PMs, or admins can view their own submissions',
      );
    }

    return this.slideSubmissionsService.getMySubmissions(user.id);
  }

  @Get('all')
  async getAllSubmissions(@Headers('authorization') authorization: string) {
    const user = await this.getUserFromHeader(authorization);
    const userRole = String(user.role);

    if (!['PM', 'LC', 'PARTNER', 'EXECUTIVE', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Only PM, LC, Partner, Executive, or Admin can view all submissions');
    }

    return this.slideSubmissionsService.getAllSubmissions();
  }

  @Post(':id/mark-commented')
  async markAsCommented(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);
    const userRole = String(user.role);

    if (!['PM', 'LC', 'PARTNER', 'EXECUTIVE', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Only PM, LC, Partner, Executive, or Admin can mark slides as commented');
    }

    return this.slideSubmissionsService.markAsCommented(
      id,
      user.id,
      userRole as 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'ADMIN',
    );
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);

    if (user.role !== 'PM' && user.role !== 'LC' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only PM, LC, or Admin can approve slides');
    }

    return this.slideSubmissionsService.approveSubmission(
      id,
      user.id,
      user.role as 'PM' | 'LC' | 'ADMIN',
    );
  }

  @Post(':id/request-revision')
  async requestRevision(
    @Param('id') id: string,
    @Body() body: { feedback?: string },
    @Headers('authorization') authorization: string,
  ) {
    const user = await this.getUserFromHeader(authorization);

    if (user.role !== 'PM' && user.role !== 'LC' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only PM, LC, or Admin can request revisions');
    }

    return this.slideSubmissionsService.requestRevision(
      id,
      user.id,
      user.role as 'PM' | 'LC' | 'ADMIN',
      body.feedback,
    );
  }

  @Get('task/:taskId')
  async getByTask(
    @Param('taskId') taskId: string,
    @Headers('authorization') authorization: string,
  ) {
    await this.getUserFromHeader(authorization);
    return this.slideSubmissionsService.getSubmissionsByTask(taskId);
  }
}
