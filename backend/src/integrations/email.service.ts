import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail = this.configService.get<string>('EMAIL_FROM') || 'notifications@otcr.com';

    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  async sendEmail(message: EmailMessage): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn('Resend API key not configured');
      return false;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: message.to,
        subject: message.subject,
        html: message.html,
      });

      if (error) {
        throw error;
      }

      this.logger.log(`Email sent successfully to ${message.to}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      return false;
    }
  }

  async sendDeadlineReminder(
    email: string,
    name: string,
    deliverableTitle: string,
    projectName: string,
    deadline: Date,
    hoursRemaining: number,
  ): Promise<boolean> {
    const urgencyClass = hoursRemaining <= 1 ? 'urgent' : hoursRemaining <= 24 ? 'warning' : 'normal';

    const html = this.buildEmailTemplate({
      title: `Deadline Reminder: ${deliverableTitle}`,
      body: `
        <p>Hi ${name},</p>
        <p>This is a reminder that you have a deliverable due soon:</p>
        <div class="info-box ${urgencyClass}">
          <h3>${deliverableTitle}</h3>
          <p><strong>Project:</strong> ${projectName}</p>
          <p><strong>Due:</strong> ${deadline.toLocaleString()}</p>
          <p><strong>Time Remaining:</strong> ${hoursRemaining} hours</p>
        </div>
        <p>Please ensure you submit your work before the deadline.</p>
      `,
    });

    return this.sendEmail({
      to: email,
      subject: `⏰ Deadline Reminder: ${deliverableTitle}`,
      html,
    });
  }

  async sendExtensionApproved(
    email: string,
    name: string,
    deliverableTitle: string,
    newDeadline: Date,
  ): Promise<boolean> {
    const html = this.buildEmailTemplate({
      title: 'Extension Approved',
      body: `
        <p>Hi ${name},</p>
        <p>Good news! Your extension request has been approved.</p>
        <div class="info-box success">
          <h3>${deliverableTitle}</h3>
          <p><strong>New Deadline:</strong> ${newDeadline.toLocaleString()}</p>
        </div>
        <p>Please make sure to submit your work by the new deadline.</p>
      `,
    });

    return this.sendEmail({
      to: email,
      subject: `✅ Extension Approved: ${deliverableTitle}`,
      html,
    });
  }

  async sendExtensionDenied(
    email: string,
    name: string,
    deliverableTitle: string,
    reason?: string,
  ): Promise<boolean> {
    const html = this.buildEmailTemplate({
      title: 'Extension Request Not Approved',
      body: `
        <p>Hi ${name},</p>
        <p>Unfortunately, your extension request was not approved.</p>
        <div class="info-box error">
          <h3>${deliverableTitle}</h3>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        </div>
        <p>Please adhere to the original deadline or contact your PM for more information.</p>
      `,
    });

    return this.sendEmail({
      to: email,
      subject: `❌ Extension Not Approved: ${deliverableTitle}`,
      html,
    });
  }

  async sendSubmissionApproved(
    email: string,
    name: string,
    deliverableTitle: string,
    feedback?: string,
  ): Promise<boolean> {
    const html = this.buildEmailTemplate({
      title: 'Submission Approved',
      body: `
        <p>Hi ${name},</p>
        <p>Congratulations! Your submission has been approved.</p>
        <div class="info-box success">
          <h3>${deliverableTitle}</h3>
          ${feedback ? `<p><strong>Feedback:</strong> ${feedback}</p>` : ''}
        </div>
        <p>Great work!</p>
      `,
    });

    return this.sendEmail({
      to: email,
      subject: `✅ Submission Approved: ${deliverableTitle}`,
      html,
    });
  }

  async sendSubmissionRejected(
    email: string,
    name: string,
    deliverableTitle: string,
    feedback: string,
  ): Promise<boolean> {
    const html = this.buildEmailTemplate({
      title: 'Revision Requested',
      body: `
        <p>Hi ${name},</p>
        <p>Your submission requires some revisions before approval.</p>
        <div class="info-box warning">
          <h3>${deliverableTitle}</h3>
          <p><strong>Feedback:</strong> ${feedback}</p>
        </div>
        <p>Please make the necessary changes and resubmit.</p>
      `,
    });

    return this.sendEmail({
      to: email,
      subject: `🔄 Revision Requested: ${deliverableTitle}`,
      html,
    });
  }

  async sendExtensionRequestToPM(
    pmEmail: string,
    pmName: string,
    consultantName: string,
    deliverableTitle: string,
    projectName: string,
    reason: string,
    requestedDate: Date,
  ): Promise<boolean> {
    const html = this.buildEmailTemplate({
      title: 'Extension Request Received',
      body: `
        <p>Hi ${pmName},</p>
        <p>${consultantName} has requested an extension for a deliverable.</p>
        <div class="info-box warning">
          <h3>${deliverableTitle}</h3>
          <p><strong>Project:</strong> ${projectName}</p>
          <p><strong>Requested Until:</strong> ${requestedDate.toLocaleDateString()}</p>
          <p><strong>Reason:</strong> ${reason}</p>
        </div>
        <p>Please review and respond to this request in the dashboard.</p>
      `,
    });

    return this.sendEmail({
      to: pmEmail,
      subject: `📝 Extension Request: ${deliverableTitle}`,
      html,
    });
  }

  private buildEmailTemplate(options: { title: string; body: string }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .content {
            background: white;
            padding: 30px 20px;
            border: 1px solid #e0e0e0;
            border-top: none;
            border-radius: 0 0 8px 8px;
          }
          .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info-box.success {
            background: #d4edda;
            border-left-color: #28a745;
          }
          .info-box.warning {
            background: #fff3cd;
            border-left-color: #ffc107;
          }
          .info-box.error {
            background: #f8d7da;
            border-left-color: #dc3545;
          }
          .info-box.urgent {
            background: #f8d7da;
            border-left-color: #dc3545;
          }
          .info-box h3 {
            margin-top: 0;
            color: #333;
          }
          .footer {
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>OTCR Dashboard</h1>
        </div>
        <div class="content">
          <h2>${options.title}</h2>
          ${options.body}
        </div>
        <div class="footer">
          <p>This is an automated message from OTCR Dashboard</p>
          <p>Please do not reply to this email</p>
        </div>
      </body>
      </html>
    `;
  }
}
