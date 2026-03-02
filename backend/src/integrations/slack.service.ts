import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SlackOAuthPurpose } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

interface SlackApiResponse<T = Record<string, any>> {
  ok: boolean;
  error?: string;
  [key: string]: any;
}

interface SlackOAuthAccessResponse extends SlackApiResponse {
  access_token?: string;
  team?: {
    id?: string;
    name?: string;
  };
  enterprise?: {
    id?: string;
    name?: string;
  };
  authed_user?: {
    id?: string;
  };
}

interface SlackMessage {
  text: string;
  blocks?: any[];
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scopes: string;
  private readonly tokenEncryptionKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.clientId = this.configService.get<string>('SLACK_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('SLACK_CLIENT_SECRET') || '';
    this.redirectUri = this.configService.get<string>('SLACK_REDIRECT_URI') || '';
    this.scopes =
      this.configService.get<string>('SLACK_SCOPES') ||
      'chat:write,im:write,users:read.email';
    this.tokenEncryptionKey =
      this.configService.get<string>('SLACK_BOT_TOKEN_ENCRYPTION_KEY') || '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  async createOAuthState(
    userId: string,
    purpose: SlackOAuthPurpose,
    workspaceId?: string,
    redirectUri?: string,
  ): Promise<string> {
    const state = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.slackOAuthState.create({
      data: {
        state,
        userId,
        purpose,
        workspaceId,
        redirectUri,
        expiresAt,
      },
    });

    return state;
  }

  async getValidOAuthState(state: string) {
    const oauthState = await this.prisma.slackOAuthState.findUnique({
      where: { state },
    });

    if (!oauthState) {
      throw new Error('Invalid Slack OAuth state');
    }

    if (oauthState.usedAt) {
      throw new Error('Slack OAuth state has already been used');
    }

    if (oauthState.expiresAt.getTime() < Date.now()) {
      throw new Error('Slack OAuth state has expired');
    }

    return oauthState;
  }

  async markOAuthStateUsed(id: string): Promise<void> {
    await this.prisma.slackOAuthState.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  getInstallUrl(state: string): string {
    if (!this.isConfigured()) {
      throw new Error('Slack OAuth is not configured');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: this.scopes,
      redirect_uri: this.redirectUri,
      state,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  async exchangeOAuthCode(code: string): Promise<SlackOAuthAccessResponse> {
    if (!this.isConfigured()) {
      throw new Error('Slack OAuth is not configured');
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
    });

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Slack OAuth exchange failed with status ${response.status}`);
    }

    const data = (await response.json()) as SlackOAuthAccessResponse;

    if (!data.ok || !data.access_token || !data.team?.id) {
      throw new Error(`Slack OAuth exchange failed: ${data.error || 'unknown_error'}`);
    }

    return data;
  }

  async upsertWorkspaceInstallation(params: {
    teamId: string;
    teamName?: string;
    enterpriseId?: string;
    botAccessToken: string;
    installedByUserId?: string;
  }) {
    const encryptedToken = this.encryptToken(params.botAccessToken);
    const installedByData =
      params.installedByUserId !== undefined
        ? { installedByUserId: params.installedByUserId }
        : {};

    return this.prisma.slackWorkspace.upsert({
      where: { teamId: params.teamId },
      create: {
        teamId: params.teamId,
        teamName: params.teamName,
        enterpriseId: params.enterpriseId,
        botAccessToken: encryptedToken,
        ...installedByData,
      },
      update: {
        teamName: params.teamName,
        enterpriseId: params.enterpriseId,
        botAccessToken: encryptedToken,
        ...installedByData,
      },
    });
  }

  async linkUserToSlack(
    userId: string,
    workspaceId: string,
    slackUserId: string,
  ) {
    return this.prisma.slackUserConnection.upsert({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
      create: {
        userId,
        workspaceId,
        slackUserId,
      },
      update: {
        slackUserId,
      },
    });
  }

  async connectUserByEmail(userId: string, teamId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const workspace = teamId
      ? await this.prisma.slackWorkspace.findUnique({ where: { teamId } })
      : await this.prisma.slackWorkspace.findFirst({ orderBy: { updatedAt: 'desc' } });

    if (!workspace) {
      throw new Error('No Slack workspace is installed yet');
    }

    const token = this.decryptToken(workspace.botAccessToken);

    const lookup = await this.callSlackApi<{ user?: { id: string } }>(
      'users.lookupByEmail',
      token,
      {
        email: user.email,
      },
    );

    if (!lookup.user?.id) {
      throw new Error('Slack user not found for this email in the selected workspace');
    }

    const connection = await this.linkUserToSlack(user.id, workspace.id, lookup.user.id);

    return {
      teamId: workspace.teamId,
      slackUserId: connection.slackUserId,
    };
  }

  async getUserConnections(userId: string) {
    return this.prisma.slackUserConnection.findMany({
      where: { userId },
      include: {
        workspace: {
          select: {
            teamId: true,
            teamName: true,
            enterpriseId: true,
            installedAt: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async getWorkspaceByTeamId(teamId: string) {
    return this.prisma.slackWorkspace.findUnique({
      where: { teamId },
    });
  }

  async sendDirectMessageToUser(userId: string, message: SlackMessage): Promise<boolean> {
    const connection = await this.prisma.slackUserConnection.findFirst({
      where: { userId },
      include: { workspace: true },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!connection) {
      this.logger.warn(`No Slack connection found for user ${userId}`);
      return false;
    }

    try {
      const botToken = this.decryptToken(connection.workspace.botAccessToken);

      const opened = await this.callSlackApi<{ channel?: { id: string } }>(
        'conversations.open',
        botToken,
        {
          users: connection.slackUserId,
        },
      );

      const channelId = opened.channel?.id;
      if (!channelId) {
        throw new Error('Failed to open Slack DM channel');
      }

      await this.callSlackApi(
        'chat.postMessage',
        botToken,
        {
          channel: channelId,
          text: message.text,
          ...(message.blocks ? { blocks: message.blocks } : {}),
        },
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send Slack DM to user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async sendDeadlineReminder(
    userId: string,
    deliverableTitle: string,
    projectName: string,
    deadline: Date,
    consultantName: string,
    hoursRemaining: number,
  ): Promise<boolean> {
    return this.sendDirectMessageToUser(userId, {
      text:
        `Deadline reminder for ${consultantName}: ${deliverableTitle} is due in ${hoursRemaining} hour(s). ` +
        `Project: ${projectName}. Deadline: ${deadline.toLocaleString()}.`,
    });
  }

  async sendExtensionRequest(
    userId: string,
    deliverableTitle: string,
    projectName: string,
    consultantName: string,
    reason: string,
    requestedDate: Date,
  ): Promise<boolean> {
    return this.sendDirectMessageToUser(userId, {
      text:
        `${consultantName} requested an extension for ${deliverableTitle} (${projectName}). ` +
        `Requested until ${requestedDate.toLocaleDateString()}. Reason: ${reason}.`,
    });
  }

  async sendExtensionApproved(
    userId: string,
    deliverableTitle: string,
    consultantName: string,
    newDeadline: Date,
  ): Promise<boolean> {
    return this.sendDirectMessageToUser(userId, {
      text:
        `${consultantName}, your extension was approved for ${deliverableTitle}. ` +
        `New deadline: ${newDeadline.toLocaleDateString()}.`,
    });
  }

  async sendExtensionDenied(
    userId: string,
    deliverableTitle: string,
    consultantName: string,
    reason?: string,
  ): Promise<boolean> {
    const reasonSuffix = reason ? ` Reason: ${reason}.` : '';

    return this.sendDirectMessageToUser(userId, {
      text:
        `${consultantName}, your extension was denied for ${deliverableTitle}.` +
        reasonSuffix,
    });
  }

  async sendSubmissionReceived(
    userId: string,
    deliverableTitle: string,
    projectName: string,
    consultantName: string,
  ): Promise<boolean> {
    return this.sendDirectMessageToUser(userId, {
      text: `${consultantName} submitted ${deliverableTitle} for project ${projectName}.`,
    });
  }

  async sendSubmissionApproved(
    userId: string,
    deliverableTitle: string,
    consultantName: string,
    feedback?: string,
  ): Promise<boolean> {
    const feedbackSuffix = feedback ? ` Feedback: ${feedback}` : '';

    return this.sendDirectMessageToUser(userId, {
      text: `${consultantName}, your submission was approved for ${deliverableTitle}.${feedbackSuffix}`,
    });
  }

  async sendSubmissionRejected(
    userId: string,
    deliverableTitle: string,
    consultantName: string,
    feedback: string,
  ): Promise<boolean> {
    return this.sendDirectMessageToUser(userId, {
      text: `${consultantName}, your submission needs revision for ${deliverableTitle}. Feedback: ${feedback}`,
    });
  }

  private async callSlackApi<T = Record<string, any>>(
    endpoint: string,
    token: string,
    payload: Record<string, any>,
  ): Promise<T> {
    const response = await fetch(`https://slack.com/api/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack API ${endpoint} failed with status ${response.status}`);
    }

    const data = (await response.json()) as SlackApiResponse<T>;

    if (!data.ok) {
      throw new Error(`Slack API ${endpoint} error: ${data.error || 'unknown_error'}`);
    }

    return data as T;
  }

  private encryptToken(token: string): string {
    if (!this.tokenEncryptionKey) {
      return token;
    }

    const iv = randomBytes(12);
    const key = createHash('sha256').update(this.tokenEncryptionKey).digest();
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptToken(token: string): string {
    if (!token.startsWith('enc:')) {
      return token;
    }

    if (!this.tokenEncryptionKey) {
      throw new Error('Encrypted Slack token found but SLACK_BOT_TOKEN_ENCRYPTION_KEY is missing');
    }

    const parts = token.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted Slack token format');
    }

    const [, ivHex, authTagHex, encryptedHex] = parts;
    const key = createHash('sha256').update(this.tokenEncryptionKey).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));

    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
