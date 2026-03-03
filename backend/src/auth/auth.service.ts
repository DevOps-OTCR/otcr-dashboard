import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async getUserByEmail(email: string) {
    if (!email || typeof email !== 'string') {
      throw new UnauthorizedException('Invalid user email');
    }
    const normalizedEmail = email.toLowerCase().trim();

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
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
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
