import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../common/roles.decorator';
import { GetUser } from '../common/get-user.decorator';

@Controller('feedback')
@UseGuards(AuthGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post('submissions')
  @Roles('ADMIN', 'PM', 'LC', 'PARTNER', 'EXECUTIVE', 'CONSULTANT')
  async createSubmission(
    @Body() body: { problem?: string; description?: string },
    @GetUser() user: any,
  ) {
    const submission = await this.feedbackService.createFormSubmission(user, 'DASHBOARD_FEEDBACK', body);
    return { success: true, submission };
  }

  @Get('submissions')
  @Roles('ADMIN')
  async listSubmissions() {
    const submissions = await this.feedbackService.listFormSubmissions('DASHBOARD_FEEDBACK');
    return { success: true, submissions };
  }

  @Post('forms/:formType/submissions')
  @Roles('ADMIN', 'PM', 'LC', 'PARTNER', 'EXECUTIVE', 'CONSULTANT')
  async createFormSubmission(
    @Param('formType') formTypeParam: string,
    @Body()
    body: {
      problem?: string;
      description?: string;
      urgency?: string;
      contactName?: string;
      contactEmail?: string;
    },
    @GetUser() user: any,
  ) {
    const formType = this.feedbackService.parseFormType(formTypeParam);
    const submission = await this.feedbackService.createFormSubmission(user, formType, body);
    return { success: true, submission };
  }

  @Get('forms/:formType/submissions')
  @Roles('ADMIN', 'PM', 'LC', 'PARTNER', 'EXECUTIVE', 'CONSULTANT')
  async listFormSubmissions(
    @Param('formType') formTypeParam: string,
    @GetUser() user: any,
  ) {
    const formType = this.feedbackService.parseFormType(formTypeParam);
    if (!this.feedbackService.canReviewFormSubmissions(formType, user?.role)) {
      throw new ForbiddenException('You do not have permission to review these submissions.');
    }
    const submissions = await this.feedbackService.listFormSubmissions(formType);
    return { success: true, submissions };
  }
}
