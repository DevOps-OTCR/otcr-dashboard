import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, SlackRoleSuggestionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { updateAllowedEmailRole } from '../auth/access-role';
import { SlackService } from './slack.service';
import { suggestRoleFromSlackTitle } from './slack-role-map';

const NOT_CONNECTED_MESSAGE =
  'Slack is not connected for this workspace. Install the Slack app first.';

const ROLE_CHANGED_MESSAGE =
  'Role changed since this suggestion; check Slack titles again';

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
        retired: 0,
        failed: 0,
        usersWithoutSlack: 0,
      };
    }

    const connections = await this.prisma.slackUserConnection.findMany({
      where: { workspaceId: workspace.id },
      include: { user: true },
    });

    const usersWithoutSlack = await this.prisma.user.count({
      where: { active: true, slackConnections: { none: {} } },
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let retired = 0;
    let failed = 0;

    for (const connection of connections) {
      const user = connection.user;

      // Never suggest a change for an administrator.
      if (user.role === Role.ADMIN) {
        retired += await this.retirePending(user.id);
        continue;
      }

      if (!user.active) {
        retired += await this.retirePending(user.id);
        continue;
      }

      let title: string | null;
      try {
        title = await this.slack.getSlackProfileTitle(
          workspace.botAccessToken,
          connection.slackUserId,
        );
      } catch (error) {
        // Title unknown: do not retire anything.
        failed++;
        this.logger.warn(
          `Failed to fetch Slack profile for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      const suggested = suggestRoleFromSlackTitle(title);
      if (!title || !suggested || suggested === user.role) {
        retired += await this.retirePending(user.id);
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
          pending.slackTitle === title &&
          pending.currentRole === user.role &&
          pending.slackUserId === connection.slackUserId
        ) {
          skipped++;
          continue;
        }
        // Never edit a PENDING suggestion in place: an admin may have reviewed
        // the old role. Delete it conditionally and create a fresh row.
        const removed = await this.prisma.slackRoleSuggestion.deleteMany({
          where: { id: pending.id, status: SlackRoleSuggestionStatus.PENDING },
        });
        if (removed.count === 0) {
          skipped++;
          continue;
        }
        const result = await this.createPending(user.id, connection.slackUserId, title, user.role, suggested);
        if (result === 'created') {
          updated++;
        } else {
          skipped++;
        }
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

      const result = await this.createPending(user.id, connection.slackUserId, title, user.role, suggested);
      if (result === 'created') {
        created++;
      } else {
        skipped++;
      }
    }

    // sync never changes any user role; suggestions are reviewed by an ADMIN.
    return {
      status: 'connected' as const,
      created,
      updated,
      skipped,
      retired,
      failed,
      usersWithoutSlack,
    };
  }

  private async retirePending(userId: string): Promise<number> {
    const result = await this.prisma.slackRoleSuggestion.deleteMany({
      where: { userId, status: SlackRoleSuggestionStatus.PENDING },
    });
    return result.count;
  }

  private async createPending(
    userId: string,
    slackUserId: string,
    slackTitle: string,
    currentRole: Role,
    suggestedRole: Role,
  ): Promise<'created' | 'skipped'> {
    try {
      await this.prisma.slackRoleSuggestion.create({
        data: {
          userId,
          slackUserId,
          slackTitle,
          currentRole,
          suggestedRole,
          status: SlackRoleSuggestionStatus.PENDING,
        },
      });
      return 'created';
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Another sync created a PENDING row concurrently.
        return 'skipped';
      }
      throw error;
    }
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

      const user = await tx.user.findUnique({
        where: { id: suggestion.userId },
      });
      if (!user) {
        throw new NotFoundException('User no longer exists');
      }
      if (!user.active) {
        throw new ConflictException('User is no longer active');
      }
      if (user.role === Role.ADMIN) {
        throw new ConflictException(
          'Administrators cannot be changed from Slack suggestions',
        );
      }
      if (user.role !== suggestion.currentRole) {
        throw new ConflictException(ROLE_CHANGED_MESSAGE);
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

      const updatedUser = await tx.user.updateMany({
        where: { id: user.id, role: suggestion.currentRole },
        data: { role: suggestion.suggestedRole },
      });
      if (updatedUser.count === 0) {
        // Rolls back the claim above.
        throw new ConflictException(ROLE_CHANGED_MESSAGE);
      }

      // The role written always comes from the stored suggestion, never from request data.
      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          role: suggestion.suggestedRole,
        },
      };
    });
  }

  async dismiss(id: string, reviewerId: string) {
    const suggestion = await this.prisma.slackRoleSuggestion.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }
    if (suggestion.status !== SlackRoleSuggestionStatus.PENDING) {
      throw new ConflictException('Suggestion was already reviewed');
    }

    const result = await this.prisma.slackRoleSuggestion.updateMany({
      where: { id, status: SlackRoleSuggestionStatus.PENDING },
      data: {
        status: SlackRoleSuggestionStatus.DISMISSED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new ConflictException('Suggestion was already reviewed');
    }

    return { success: true };
  }
}
