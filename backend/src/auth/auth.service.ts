import { Injectable, UnauthorizedException } from '@nestjs/common';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async verifyToken(token: string) {
    try {
      // Verify the token with Clerk
      const decoded = await clerkClient.verifyToken(token);
      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async getUserFromClerk(clerkId: string) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      return clerkUser;
    } catch (error) {
      throw new UnauthorizedException('User not found');
    }
  }

  async syncUserWithDatabase(clerkId: string) {
    const clerkUser = await this.getUserFromClerk(clerkId);

    // Find or create user in database
    let user = await this.prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          clerkId,
          email: clerkUser.emailAddresses[0].emailAddress,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          role: this.determineRole(clerkUser.emailAddresses[0].emailAddress),
        },
      });
    } else {
      // Update existing user
      user = await this.prisma.user.update({
        where: { clerkId },
        data: {
          email: clerkUser.emailAddresses[0].emailAddress,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
        },
      });
    }

    return user;
  }

  private determineRole(email: string): 'ADMIN' | 'PM' | 'CONSULTANT' {
    // Define role based on email
    // You can customize this logic based on your requirements
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
