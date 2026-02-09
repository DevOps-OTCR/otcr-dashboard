import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async getUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
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
        // Create new user
        user = await this.prisma.user.create({
          data: {
            googleId,
            email,
            firstName,
            lastName,
            role: this.determineRole(email),
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

  async addAllowedEmail(email: string, role?: 'ADMIN' | 'PM' | 'CONSULTANT') {
    return this.prisma.allowedEmail.create({
      data: {
        email,
        role,
      },
    });
  }

  async removeAllowedEmail(email: string) {
    return this.prisma.allowedEmail.update({
      where: { email },
      data: { active: false },
    });
  }

  private determineRole(email: string): 'ADMIN' | 'PM' | 'CONSULTANT' {
    // First check if email has a role in AllowedEmail table
    // Otherwise, use default logic
    // Note: This method is called during user sync, so we'll check the database
    // For now, keep the default logic but it can be enhanced to check AllowedEmail table
    const adminEmails = ['admin@otcr.com'];
    const pmEmails = ['lsharma2@illinois.edu'];

    if (adminEmails.includes(email)) {
      return 'ADMIN';
    } else if (pmEmails.includes(email)) {
      return 'PM';
    }
    return 'CONSULTANT';
  }
}
