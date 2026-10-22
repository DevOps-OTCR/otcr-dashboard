import { UnauthorizedException } from '@nestjs/common';
import { getVerifiedUser } from '../common/utils/verify';
import { normalizeEmail } from './access-policy';

export async function getVerifiedEmail(authorization: unknown): Promise<string> {
  const match = typeof authorization === 'string'
    ? /^Bearer\s+(\S+)$/i.exec(authorization.trim()) : null;
  // Email-only headers were a legacy impersonation path, not identity proof.
  if (!match || match[1].includes('@')) {
    throw new UnauthorizedException('A verified Microsoft access token is required');
  }
  try {
    const email = await getVerifiedUser(match[1]);
    if (typeof email !== 'string' || !email.trim()) throw new Error('Missing identity');
    return normalizeEmail(email);
  } catch {
    throw new UnauthorizedException('Invalid or expired Microsoft access token');
  }
}
