import { BadRequestException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

export function parseRole(value: unknown): Role {
  if (typeof value !== 'string' || !Object.values(Role).includes(value as Role)) {
    throw new BadRequestException('Select a valid CMS role');
  }
  return value as Role;
}

type AccessPolicy = { mode: 'activate' } | { mode: 'preserve'; activeOnCreate: boolean };

// Use the caller's transaction so AllowedEmail and User roles commit together.
export async function updateAllowedEmailRole(
  tx: Prisma.TransactionClient,
  email: string,
  role: Role,
  policy: AccessPolicy,
) {
  const normalizedEmail = email.toLowerCase().trim();
  const where = { email: { equals: normalizedEmail, mode: 'insensitive' as const } };
  const updated = await tx.allowedEmail.updateMany({
    where,
    data: policy.mode === 'activate' ? { role, active: true } : { role },
  });
  if (!updated.count) {
    return tx.allowedEmail.create({ data: { email: normalizedEmail, role,
      active: policy.mode === 'activate' || policy.activeOnCreate } });
  }
  return tx.allowedEmail.findFirstOrThrow({ where });
}
