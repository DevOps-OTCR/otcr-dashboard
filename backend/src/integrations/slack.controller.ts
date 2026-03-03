import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { SlackOAuthPurpose } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { SlackService } from './slack.service';

@Controller('integrations/slack')
export class SlackController {
  constructor(
    private readonly slackService: SlackService,
    private readonly authService: AuthService,
  ) {}

  private async getUserFromHeader(authorization: string) {
    if (!authorization) {
      throw new UnauthorizedException('No authorization header');
    }

    const email = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!email) {
      throw new UnauthorizedException('No user identifier in authorization');
    }

    const user = await this.authService.getUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  @Get('install-url')
  async getInstallUrl(
    @Headers('authorization') authorization: string,
    @Query('purpose') purposeRaw?: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('redirectUri') redirectUri?: string,
  ) {
    const user = await this.getUserFromHeader(authorization);

    if (!this.slackService.isConfigured()) {
      throw new BadRequestException('Slack OAuth is not configured in backend environment variables');
    }

    const purpose: SlackOAuthPurpose =
      purposeRaw === 'CONNECT' ? 'CONNECT' : 'INSTALL';

    if (purpose === 'INSTALL' && !['ADMIN', 'PM', 'PARTNER', 'EXECUTIVE'].includes(user.role)) {
      throw new ForbiddenException('Only PM/Admin/Partner/Executive can install Slack workspaces');
    }

    const state = await this.slackService.createOAuthState(
      user.id,
      purpose,
      workspaceId,
      redirectUri,
    );

    return {
      installUrl: this.slackService.getInstallUrl(state),
      state,
      purpose,
    };
  }

  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    if (!code || !state) {
      throw new BadRequestException('Missing Slack OAuth code or state');
    }

    const oauthState = await this.slackService.getValidOAuthState(state);
    const oauthResponse = await this.slackService.exchangeOAuthCode(code);

    const teamId = oauthResponse.team?.id;
    const teamName = oauthResponse.team?.name;
    const enterpriseId = oauthResponse.enterprise?.id;
    const botAccessToken = oauthResponse.access_token;

    if (!teamId || !botAccessToken) {
      throw new BadRequestException('Slack OAuth response missing required workspace details');
    }

    const workspace = await this.slackService.upsertWorkspaceInstallation({
      teamId,
      teamName,
      enterpriseId,
      botAccessToken,
      ...(oauthState.purpose === 'INSTALL'
        ? { installedByUserId: oauthState.userId }
        : {}),
    });

    const authedSlackUserId = oauthResponse.authed_user?.id;

    if (oauthState.workspaceId && oauthState.workspaceId !== workspace.id) {
      throw new BadRequestException('OAuth completed for a different workspace than requested');
    }

    if (authedSlackUserId) {
      await this.slackService.linkUserToSlack(
        oauthState.userId,
        workspace.id,
        authedSlackUserId,
      );
    }

    await this.slackService.markOAuthStateUsed(oauthState.id);

    return {
      success: true,
      teamId: workspace.teamId,
      teamName: workspace.teamName,
      linkedSlackUserId: authedSlackUserId || null,
      redirectUri: oauthState.redirectUri || null,
      message:
        oauthState.purpose === 'CONNECT'
          ? 'Slack user connection established'
          : 'Slack workspace installed successfully',
    };
  }

  @Post('connect-by-email')
  async connectByEmail(
    @Headers('authorization') authorization: string,
    @Body() body: { teamId?: string },
  ) {
    const user = await this.getUserFromHeader(authorization);

    const result = await this.slackService.connectUserByEmail(user.id, body?.teamId);

    return {
      success: true,
      ...result,
    };
  }

  @Post('link')
  async manualLink(
    @Headers('authorization') authorization: string,
    @Body() body: { teamId: string; slackUserId: string },
  ) {
    const user = await this.getUserFromHeader(authorization);

    if (!body?.teamId || !body?.slackUserId) {
      throw new BadRequestException('teamId and slackUserId are required');
    }

    const workspace = await this.slackService.getWorkspaceByTeamId(body.teamId);

    if (!workspace) {
      throw new BadRequestException('Workspace is not installed. Install workspace with OAuth first.');
    }

    const connection = await this.slackService.linkUserToSlack(
      user.id,
      workspace.id,
      body.slackUserId,
    );

    return {
      success: true,
      teamId: body.teamId,
      slackUserId: connection.slackUserId,
    };
  }

  @Get('connections')
  async getConnections(@Headers('authorization') authorization: string) {
    const user = await this.getUserFromHeader(authorization);

    const connections = await this.slackService.getUserConnections(user.id);

    return {
      success: true,
      connections,
    };
  }
}
