import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SlackMessage {
  title?: string;
  message: string;
  color?: 'good' | 'warning' | 'danger' | string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly webhookUrl: string;

  constructor(private configService: ConfigService) {
    this.webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
  }

  async sendMessage(message: SlackMessage): Promise<boolean> {
    if (!this.webhookUrl) {
      this.logger.warn('Slack webhook URL not configured');
      return false;
    }

    try {
      const payload = this.buildPayload(message);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }

      this.logger.log('Slack message sent successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to send Slack message:', error);
      return false;
    }
  }

  async sendDeadlineReminder(
    deliverableTitle: string,
    projectName: string,
    deadline: Date,
    consultantName: string,
    hoursRemaining: number,
  ): Promise<boolean> {
    const urgency = hoursRemaining <= 1 ? 'danger' : hoursRemaining <= 24 ? 'warning' : 'good';

    return this.sendMessage({
      title: `⏰ Deadline Reminder: ${deliverableTitle}`,
      message: `${consultantName}, you have a deliverable due soon!`,
      color: urgency,
      fields: [
        { title: 'Project', value: projectName, short: true },
        { title: 'Time Remaining', value: `${hoursRemaining} hours`, short: true },
        { title: 'Deadline', value: deadline.toLocaleString(), short: false },
      ],
    });
  }

  async sendExtensionRequest(
    deliverableTitle: string,
    projectName: string,
    consultantName: string,
    reason: string,
    requestedDate: Date,
  ): Promise<boolean> {
    return this.sendMessage({
      title: `📝 Extension Request: ${deliverableTitle}`,
      message: `${consultantName} has requested an extension`,
      color: 'warning',
      fields: [
        { title: 'Project', value: projectName, short: true },
        { title: 'Requested Until', value: requestedDate.toLocaleDateString(), short: true },
        { title: 'Reason', value: reason, short: false },
      ],
    });
  }

  async sendExtensionApproved(
    deliverableTitle: string,
    consultantName: string,
    newDeadline: Date,
  ): Promise<boolean> {
    return this.sendMessage({
      title: `✅ Extension Approved: ${deliverableTitle}`,
      message: `${consultantName}, your extension request has been approved!`,
      color: 'good',
      fields: [
        { title: 'New Deadline', value: newDeadline.toLocaleDateString(), short: false },
      ],
    });
  }

  async sendExtensionDenied(
    deliverableTitle: string,
    consultantName: string,
    reason?: string,
  ): Promise<boolean> {
    return this.sendMessage({
      title: `❌ Extension Denied: ${deliverableTitle}`,
      message: `${consultantName}, your extension request was not approved`,
      color: 'danger',
      fields: reason
        ? [{ title: 'Reason', value: reason, short: false }]
        : [],
    });
  }

  async sendSubmissionReceived(
    deliverableTitle: string,
    projectName: string,
    consultantName: string,
  ): Promise<boolean> {
    return this.sendMessage({
      title: `📤 Submission Received: ${deliverableTitle}`,
      message: `${consultantName} has submitted a deliverable`,
      color: 'good',
      fields: [
        { title: 'Project', value: projectName, short: true },
      ],
    });
  }

  async sendSubmissionApproved(
    deliverableTitle: string,
    consultantName: string,
    feedback?: string,
  ): Promise<boolean> {
    return this.sendMessage({
      title: `✅ Submission Approved: ${deliverableTitle}`,
      message: `${consultantName}, your submission has been approved!`,
      color: 'good',
      fields: feedback
        ? [{ title: 'Feedback', value: feedback, short: false }]
        : [],
    });
  }

  async sendSubmissionRejected(
    deliverableTitle: string,
    consultantName: string,
    feedback: string,
  ): Promise<boolean> {
    return this.sendMessage({
      title: `🔄 Revision Requested: ${deliverableTitle}`,
      message: `${consultantName}, please revise and resubmit`,
      color: 'warning',
      fields: [
        { title: 'Feedback', value: feedback, short: false },
      ],
    });
  }

  private buildPayload(message: SlackMessage) {
    return {
      attachments: [
        {
          color: message.color || 'good',
          title: message.title,
          text: message.message,
          fields: message.fields || [],
          footer: 'OTCR Dashboard',
          footer_icon: 'https://platform.slack-edge.com/img/default_application_icon.png',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }
}
