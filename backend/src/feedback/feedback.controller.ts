import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
    const submission = await this.feedbackService.createSubmission(user, body);
    return { success: true, submission };
  }

  @Get('submissions')
  @Roles('ADMIN')
  async listSubmissions() {
    const submissions = await this.feedbackService.listSubmissions();
    return { success: true, submissions };
  }
}
