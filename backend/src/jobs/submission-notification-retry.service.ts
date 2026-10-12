import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliverablesService } from '../deliverables/deliverables.service';

@Injectable()
export class SubmissionNotificationRetryService {
  private readonly logger = new Logger(SubmissionNotificationRetryService.name);

  constructor(private deliverablesService: DeliverablesService) {}

  /**
   * Retry reviewer notifications for link submissions whose notifications failed
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryReviewerNotifications() {
    try {
      await this.deliverablesService.retryPendingReviewerNotifications();
    } catch (error) {
      this.logger.error(`Reviewer notification retry failed: ${error?.message ?? error}`);
    }
  }
}
