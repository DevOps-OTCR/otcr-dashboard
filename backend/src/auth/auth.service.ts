import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}
  private didBackfillOnboardingNames = false;

  private splitNameParts(name?: string | null): { firstName: string | null; lastName: string | null } {
    const normalized = (name || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return { firstName: null, lastName: null };
    const parts = normalized.split(' ');
    return {
      firstName: parts[0] || null,
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
    };
  }

  private async ensureOnboardingNamesBackfilled(): Promise<void> {
    if (this.didBackfillOnboardingNames) return;

    const approvedRequests = await (this.prisma as any).onboardingRequest.findMany({
      where: { status: 'APPROVED' as any },
      select: { email: true, name: true },
    });

    for (const request of approvedRequests) {
      const parsed = this.splitNameParts(request?.name);
      if (!parsed.firstName && !parsed.lastName) continue;

      await this.prisma.user.updateMany({
        where: {
          email: request.email,
          OR: [{ firstName: null }, { lastName: null }],
        },
        data: {
          firstName: parsed.firstName,
          lastName: parsed.lastName,
        },
      });
    }

    this.didBackfillOnboardingNames = true;
  }

  async getUserByEmail(email: string) {
    if (!email || typeof email !== 'string') {
      throw new UnauthorizedException('Invalid user email');
    }
    const normalizedEmail = email.toLowerCase().trim();
    await this.ensureOnboardingNamesBackfilled();

    // Try to find an existing user by normalized email
    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Always resolve the latest role for this email so promotions
    // (e.g. Consultant -> PM/Admin/LC) are reflected in API permissions.
    const resolvedRole = await this.determineRole(normalizedEmail);

    // If the user doesn't exist yet (e.g. sign-in sync failed), create a minimal
    // user record so role-based permissions (PM/LC/Admin) work for API calls
    // like team/project creation.
    if (!user) {
      const onboarding = await (this.prisma as any).onboardingRequest.findUnique({
        where: { email: normalizedEmail },
        select: { name: true },
      });
      const parsed = this.splitNameParts(onboarding?.name ?? null);
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          role: resolvedRole as any,
        },
      });
    } else if (user.role !== resolvedRole && resolvedRole !== 'CONSULTANT') {
      // Keep elevated roles in sync with AllowedEmail so team/project creation
      // checks that rely on user.role stay accurate.
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { role: resolvedRole as any },
      });
    }

    if (!user.firstName && !user.lastName) {
      const onboarding = await (this.prisma as any).onboardingRequest.findUnique({
        where: { email: normalizedEmail },
        select: { name: true },
      });
      const parsed = this.splitNameParts(onboarding?.name ?? null);
      if (parsed.firstName || parsed.lastName) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            firstName: parsed.firstName,
            lastName: parsed.lastName,
          },
        });
      }
    }

    return user;
  }

  async getUserByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({
      where: { googleId },
    });
  }

  async syncUserWithDatabase(googleId: string, email: string, name?: string, image?: string) {
    // Parse name into firstName and lastName
    const nameParts = name?.split(' ') || [];
    const firstName = nameParts[0] || null;
    const lastName = nameParts.slice(1).join(' ') || null;

    // Find or create user in database
    let user = await this.prisma.user.findUnique({
      where: { googleId },
    });

    if (!user) {
      // Check if user exists by email
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        // Update existing user with Google ID
        user = await this.prisma.user.update({
          where: { email },
          data: {
            googleId,
            firstName: firstName || existingUser.firstName,
            lastName: lastName || existingUser.lastName,
          },
        });
      } else {
        // Create new user (role from AllowedEmail or CONSULTANT)
        const role = await this.determineRole(email);
        user = await this.prisma.user.create({
          data: {
            googleId,
            email,
            firstName,
            lastName,
            role: role as any,
          },
        });
      }
    } else {
      // Update existing user
      user = await this.prisma.user.update({
        where: { googleId },
        data: {
          email,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
        },
      });
    }

    return user;
  }

  async isEmailAllowed(email: string): Promise<boolean> {
    // Normalize email to lowercase for case-insensitive comparison
    const normalizedEmail = email.toLowerCase().trim();
    
    const allowedEmail = await this.prisma.allowedEmail.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive', // PostgreSQL case-insensitive search
        },
        active: true,
      },
    });

    return allowedEmail !== null;
  }

  async getAllowedEmails() {
    return this.prisma.allowedEmail.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addAllowedEmail(
    email: string,
    role: 'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT' = 'CONSULTANT',
  ) {
    const normalized = email.toLowerCase().trim();
    const allowedEmail = await this.prisma.allowedEmail.upsert({
      where: { email: normalized },
      update: {
        role: role as any,
        active: true,
      },
      create: {
        email: normalized,
        role: role as any,
        active: true,
      },
    });

    // Keep existing synced users aligned with updated allowed-email role.
    await this.prisma.user.updateMany({
      where: { email: normalized },
      data: { role: role as any },
    });

    return allowedEmail;
  }

  async submitOnboardingRequest(
    name: string,
    email: string,
    requestedRole: 'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT',
  ) {
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    const normalizedEmail = email.toLowerCase().trim();

    return (this.prisma as any).onboardingRequest.upsert({
      where: { email: normalizedEmail },
      update: {
        name: normalizedName,
        requestedRole: requestedRole as any,
        status: 'PENDING' as any,
        reviewedById: null,
        reviewedAt: null,
        reviewerNotes: null,
      },
      create: {
        name: normalizedName,
        email: normalizedEmail,
        requestedRole: requestedRole as any,
        status: 'PENDING' as any,
      },
    });
  }

  async listOnboardingRequests() {
    return (this.prisma as any).onboardingRequest.findMany({
      orderBy: [
        { status: 'asc' },
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        reviewer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async approveOnboardingRequest(
    requestId: string,
    reviewerId: string,
    notes?: string,
  ) {
    const request = await (this.prisma as any).onboardingRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new UnauthorizedException('Onboarding request not found');
    }

    await this.addAllowedEmail(request.email, request.requestedRole as any);
    const parsed = this.splitNameParts(request.name);
    if (parsed.firstName || parsed.lastName) {
      await this.prisma.user.updateMany({
        where: { email: request.email },
        data: {
          firstName: parsed.firstName,
          lastName: parsed.lastName,
        },
      });
    }

    return (this.prisma as any).onboardingRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED' as any,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewerNotes: notes?.trim() || null,
      },
    });
  }

  async rejectOnboardingRequest(
    requestId: string,
    reviewerId: string,
    notes?: string,
  ) {
    return (this.prisma as any).onboardingRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED' as any,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewerNotes: notes?.trim() || null,
      },
    });
  }

  /** Get role for an email from DB (User table, or AllowedEmail if user not synced yet). */
  async getRoleByEmail(
    email: string,
  ): Promise<'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT' | null> {
    const normalized = email?.toLowerCase().trim();
    if (!normalized) return null;
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (user) return user.role;
    const allowed = await this.prisma.allowedEmail.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' }, active: true },
    });
    return allowed?.role ?? null;
  }

  async removeAllowedEmail(email: string) {
    return this.prisma.allowedEmail.update({
      where: { email },
      data: { active: false },
    });
  }

  private async determineRole(
    email: string,
  ): Promise<'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT'> {
    const allowed = await this.prisma.allowedEmail.findFirst({
      where: { email: { equals: email.toLowerCase().trim(), mode: 'insensitive' }, active: true },
    });
    if (allowed?.role) return allowed.role;
    return 'CONSULTANT';
  }
}
