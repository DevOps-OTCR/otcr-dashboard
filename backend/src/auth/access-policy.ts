import { ForbiddenException } from '@nestjs/common';
import { AllowedEmail, OnboardingRequest, Prisma, Role, User } from '@prisma/client';

export type AccessStatus = 'not_requested' | 'pending' | 'rejected' | 'approved' | 'inactive' | 'revoked' | 'review_required';
export interface AccessSummary {
  accessStatus: AccessStatus;
  requestStatus: OnboardingRequest['status'] | null;
  profileActive: boolean | null;
  accessApproved: boolean;
  hasCmsAccess: boolean;
  role: Role | null;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// AllowedEmail is the approval authority, including intentional direct grants.
// A User row, an approved request alone, or a cached session never grants access.
export function summarizeAccess(
  users: Pick<User, 'active'>[],
  grants: Pick<AllowedEmail, 'active' | 'role'>[],
  request?: Pick<OnboardingRequest, 'status'> | null,
): AccessSummary {
  const ambiguous = users.length > 1 || grants.length > 1;
  const accessApproved = !ambiguous && grants.length === 1 && grants[0].active;
  const profileActive = users.length === 1 ? users[0].active : null;
  const hasCmsAccess = accessApproved && profileActive !== false;
  let accessStatus: AccessStatus;
  if (ambiguous) accessStatus = 'review_required';
  else if (accessApproved) accessStatus = profileActive === false ? 'inactive' : 'approved';
  else if (grants.length || request?.status === 'APPROVED') accessStatus = 'revoked';
  else if (request?.status === 'PENDING') accessStatus = 'pending';
  else if (request?.status === 'REJECTED') accessStatus = 'rejected';
  else accessStatus = 'not_requested';
  return {
    accessStatus, requestStatus: request?.status ?? null, profileActive,
    accessApproved, hasCmsAccess,
    // Null roles on legacy *approved* entries keep their existing default.
    role: accessApproved ? grants[0].role ?? 'CONSULTANT' : null,
  };
}

export async function readAccess(db: Prisma.TransactionClient, email: string) {
  const where = { email: { equals: normalizeEmail(email), mode: 'insensitive' as const } };
  const [users, grants, request] = await Promise.all([
    db.user.findMany({ where }),
    db.allowedEmail.findMany({ where }),
    db.onboardingRequest.findFirst({ where }),
  ]);
  return { user: users.length === 1 ? users[0] : null, request,
    access: summarizeAccess(users, grants, request) };
}

export function requireCmsAccess(access: AccessSummary): void {
  if (!access.hasCmsAccess) {
    throw new ForbiddenException({
      statusCode: 403, code: 'CMS_ACCESS_DENIED',
      message: 'Active approved CMS access is required',
      accessStatus: access.accessStatus,
    });
  }
}
