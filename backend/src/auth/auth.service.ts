import { parseRole, updateAllowedEmailRole } from './access-role';
import { Injectable, UnauthorizedException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
    } else if (user.role !== resolvedRole) {
      // Keep user.role fully in sync with AllowedEmail, including demotions
      // (e.g. ADMIN -> CONSULTANT) so stale elevated access is removed.
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
    const selectedRole = parseRole(role);
    return this.prisma.$transaction(async tx => {
      const allowedEmail = await updateAllowedEmailRole(tx, normalized, selectedRole, { mode: 'activate' });
      await tx.user.updateMany({
        where: { email: { equals: normalized, mode: 'insensitive' } },
        data: { role: selectedRole },
      });
      return allowedEmail;
    });
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
        grantedRole: null,
        status: 'PENDING' as any,
        reviewedById: null,
        reviewedAt: null,
        reviewerNotes: null,
      },
      create: {
        name: normalizedName,
        email: normalizedEmail,
        requestedRole: requestedRole as any,
        grantedRole: null,
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
    grantedRole?: unknown,
  ) {
    if (notes !== undefined && typeof notes !== 'string') throw new BadRequestException('Notes must be text');
    const selectedRole = grantedRole === undefined ? undefined : parseRole(grantedRole);
    return this.prisma.$transaction(async tx => {
      const request = await tx.onboardingRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundException('Onboarding request not found');
      const role = selectedRole ?? request.requestedRole;
      const reviewed = await tx.onboardingRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'APPROVED', grantedRole: role, reviewedById: reviewerId,
          reviewedAt: new Date(), reviewerNotes: notes?.trim() || null },
      });
      if (!reviewed.count) throw new ConflictException('This request has already been reviewed');
      const email = request.email.toLowerCase().trim();
      await updateAllowedEmailRole(tx, email, role, { mode: 'activate' });
      const name = this.splitNameParts(request.name);
      await tx.user.upsert({
        where: { email },
        create: { email, ...name, role, active: true },
        update: { ...name, role, active: true },
      });
      return tx.onboardingRequest.findUnique({ where: { id: requestId } });
    });
  }

  async rejectOnboardingRequest(requestId: string, reviewerId: string, notes?: string) {
    if (notes !== undefined && typeof notes !== 'string') throw new BadRequestException('Notes must be text');
    return this.prisma.$transaction(async tx => {
      const request = await tx.onboardingRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundException('Onboarding request not found');
      const reviewed = await tx.onboardingRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'REJECTED', grantedRole: null, reviewedById: reviewerId,
          reviewedAt: new Date(), reviewerNotes: notes?.trim() || null },
      });
      if (!reviewed.count) throw new ConflictException('This request has already been reviewed');
      return tx.onboardingRequest.findUnique({ where: { id: requestId } });
    });
  }

  /** Get role for an email from DB (User table, or AllowedEmail if user not synced yet). */
  async getRoleByEmail(
    email: string,
  ): Promise<'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT' | null> {
    const normalized = email?.toLowerCase().trim();
    if (!normalized) return null;
    const resolvedRole = await this.determineRole(normalized);
    await this.prisma.user.updateMany({
      where: { email: normalized },
      data: { role: resolvedRole as any },
    });
    return resolvedRole;
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
