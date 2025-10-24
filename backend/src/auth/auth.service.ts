import { Injectable, UnauthorizedException } from '@nestjs/common';
import { clerkClient } from '@clerk/clerk-sdk-node';

@Injectable()
export class AuthService {
  async verifyToken(token: string) {
    try {
      // Decode the JWT to extract the session ID
      const { payload } = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      const sessionId = payload?.sid;

      if (!sessionId) {
        throw new UnauthorizedException('Missing session ID in token');
      }

      // Verify the session using sessionId + token
      const session = await clerkClient.sessions.verifySession(sessionId, token);

      // Get user info
      const user = await clerkClient.users.getUser(session.userId);

      return user;
    } catch (e) {
      console.error('Token verification failed:', e);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
