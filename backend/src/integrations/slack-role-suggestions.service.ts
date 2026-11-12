import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SlackRoleSuggestionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { updateAllowedEmailRole } from '../auth/access-role';
import { SlackService } from './slack.service';
import { suggestRoleFromSlackTitle } from './slack-role-map';

const NOT_CONNECTED_MESSAGE =
  'Slack is not connected for this workspace. Install the Slack app first.';

@Injectable()
export class SlackRoleSuggestionsService {
  private readonly logger = new Logger(SlackRoleSuggestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slack: SlackService,
  ) {}

  async list() {
    const workspace = await this.prisma.slackWorkspace.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!workspace) {
      return {
        status: 'not_connected' as const,
        message: NOT_CONNECTED_MESSAGE,
        suggestions: [],
      };
    }

    const suggestions = await this.prisma.slackRoleSuggestion.findMany({
      where: { status: SlackRoleSuggestionStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    return { status: 'connected' as const, suggestions };
  }

  async sync() {
    const workspace = await this.prisma.slackWorkspace.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!workspace) {
      return {
        status: 'not_connected' as const,
        message: NOT_CONNECTED_MESSAGE,
        created: 0,
        updated: 0,
        skipped: 0,
        usersWithoutSlack: 0,
      };
    }

    const connections = await this.prisma.slackUserConnection.findMany({
      include: { user: true, workspace: true },
    });

    const usersWithoutSlack = await this.prisma.user.count({
      where: { active: true, slackConnections: { none: {} } },
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const connection of connections) {
      const user = connection.user;
      if (!user.active) {
        skipped++;
        continue;
      }

      let title: string | null;
      try {
        title = await this.slack.getSlackProfileTitle(
          connection.workspace.botAccessToken,
          connection.slackUserId,
        );
      } catch (error) {
        skipped++;
        this.logger.warn(
          `Failed to fetch Slack profile for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      const suggested = suggestRoleFromSlackTitle(title);
      if (!title || !suggested || suggested === user.role) {
        skipped++;
        continue;
      }

      const pending = await this.prisma.slackRoleSuggestion.findFirst({
        where: {
          userId: user.id,
          status: SlackRoleSuggestionStatus.PENDING,
        },
      });

      if (pending) {
        if (
          pending.suggestedRole === suggested &&
          pending.slackTitle === title
        ) {
          skipped++;
          continue;
        }
        await this.prisma.slackRoleSuggestion.update({
          where: { id: pending.id },
          data: {
            slackUserId: connection.slackUserId,
            slackTitle: title,
            currentRole: user.role,
            suggestedRole: suggested,
          },
        });
        updated++;
        continue;
      }

      const dismissed = await this.prisma.slackRoleSuggestion.findFirst({
        where: {
          userId: user.id,
          status: SlackRoleSuggestionStatus.DISMISSED,
          suggestedRole: suggested,
          slackTitle: title,
        },
      });

      if (dismissed) {
        skipped++;
        continue;
      }

      await this.prisma.slackRoleSuggestion.create({
        data: {
          userId: user.id,
          slackUserId: connection.slackUserId,
          slackTitle: title,
          currentRole: user.role,
          suggestedRole: suggested,
          status: SlackRoleSuggestionStatus.PENDING,
        },
      });
      created++;
    }

    // sync never changes any user role; suggestions are reviewed by an ADMIN.
    return {
      status: 'connected' as const,
      created,
      updated,
      skipped,
      usersWithoutSlack,
    };
  }

  async approve(id: string, reviewerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const suggestion = await tx.slackRoleSuggestion.findUnique({
        where: { id },
      });
      if (!suggestion) {
        throw new NotFoundException('Suggestion not found');
      }
      if (suggestion.status !== SlackRoleSuggestionStatus.PENDING) {
        throw new ConflictException('Suggestion was already reviewed');
      }

      const user = await tx.user.findUnique({ where: { id: suggestion.userId } });
      if (!user) {
        throw new NotFoundException('User no longer exists');
      }

      const claimed = await tx.slackRoleSuggestion.updateMany({
        where: { id, status: SlackRoleSuggestionStatus.PENDING },
        data: {
          status: SlackRoleSuggestionStatus.APPROVED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Suggestion was already reviewed');
      }

      await updateAllowedEmailRole(tx, user.email, suggestion.suggestedRole, {
        mode: 'preserve',
        activeOnCreate: user.active,
      });

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { role: suggestion.suggestedRole },
        select: { id: true, email: true, role: true },
      });

      // The role written always comes from the stored suggestion, never from request data.
      return { success: true, user: updatedUser };
    });
  }

  async dismiss(id: string, reviewerId: string) {
    const result = await this.prisma.slackRoleSuggestion.updateMany({
      where: { id, status: SlackRoleSuggestionStatus.PENDING },
      data: {
        status: SlackRoleSuggestionStatus.DISMISSED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Pending suggestion not found');
    }

    return { success: true };
  }
}
