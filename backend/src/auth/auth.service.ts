import { parseRole, updateAllowedEmailRole } from './access-role';
import { Injectable, UnauthorizedException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { readAccess, requireCmsAccess, normalizeEmail, summarizeAccess } from './access-policy';
import { getVerifiedEmail } from './verified-identity';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  private splitNameParts(name?: string | null): { firstName: string | null; lastName: string | null } {
    const normalized = (name || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return { firstName: null, lastName: null };
    const parts = normalized.split(' ');
    return {
      firstName: parts[0] || null,
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
    };
  }

  async getAccessStatus(email: string) {
    const { access } = await readAccess(this.prisma, email);
    return access;
  }

  // Call only after verifying the caller's identity. Approval is read on every
  // request so existing Microsoft/browser sessions cannot retain revoked access.
  async getUserByEmail(email: string) {
    if (typeof email !== 'string' || !email.trim()) throw new UnauthorizedException('Invalid user email');
    return this.prisma.$transaction(tx => this.syncApprovedProfile(tx, email));
  }

  async getUserFromAuthorization(authorization: unknown) {
    return this.getUserByEmail(await getVerifiedEmail(authorization));
  }

  private async syncApprovedProfile(tx: Prisma.TransactionClient, email: string, name?: string) {
    const { user, request, access } = await readAccess(tx, email);
    requireCmsAccess(access);
    const parsed = this.splitNameParts(name ?? (request?.status === 'APPROVED' ? request.name : null));
    if (!user) {
      const created = await tx.user.upsert({
        where: { email: normalizeEmail(email) },
        create: { email: normalizeEmail(email), ...parsed, role: access.role, active: true },
        // A concurrent login may have created it. Never reactivate a profile here.
        update: {},
      });
      if (!created.active) requireCmsAccess({ ...access, hasCmsAccess: false, accessStatus: 'inactive' });
      return created;
    }
    const data: Prisma.UserUpdateInput = {};
    if (user.role !== access.role) data.role = access.role;
    if (name !== undefined || (!user.firstName && !user.lastName)) {
      if (parsed.firstName) data.firstName = parsed.firstName;
      if (parsed.lastName) data.lastName = parsed.lastName;
    }
    return Object.keys(data).length ? tx.user.update({ where: { id: user.id }, data }) : user;
  }

  async syncUserWithDatabase(email: string, name?: string) {
    if (name !== undefined && typeof name !== 'string') throw new BadRequestException('Name must be text');
    return this.prisma.$transaction(tx => this.syncApprovedProfile(tx, email, name));
  }

  // Recipient lookups must never provision an account for an unverified person.
  async findApprovedUserByEmail(email: string) {
    const { user, access } = await readAccess(this.prisma, email);
    return access.hasCmsAccess ? user : null;
  }

  async requireApprovedUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException('User not found');
    const access = await this.getAccessStatus(user.email);
    requireCmsAccess(access);
    return { ...user, role: access.role };
  }

  async isEmailAllowed(email: string): Promise<boolean> {
    return (await this.getAccessStatus(email)).hasCmsAccess;
  }

  async getAllowedEmails() {
    // Include inactive grants when grouping, so conflicting case variants cannot
    // sneak through the picker while being denied by the API.
    const [grants, users] = await Promise.all([
      this.prisma.allowedEmail.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.user.findMany({ select: { email: true, active: true } }),
    ]);
    return grants.filter(grant => {
      const email = normalizeEmail(grant.email);
      if (grant.email !== grant.email.trim()) return false;
      return summarizeAccess(
        users.filter(user => user.email.toLowerCase() === email),
        grants.filter(other => other.email.toLowerCase() === email),
      ).hasCmsAccess;
    });
  }

  private async grantUser(tx: Prisma.TransactionClient, email: string, role: Role, name?: string) {
    const normalized = normalizeEmail(email);
    const users = await tx.user.findMany({ where: { email: { equals: normalized, mode: 'insensitive' } } });
    if (users.length > 1) throw new ConflictException('Duplicate identities require administrator reconciliation');
    const data = { role, active: true, ...(name ? this.splitNameParts(name) : {}) };
    return users.length
      ? tx.user.update({ where: { id: users[0].id }, data })
      : tx.user.create({ data: { email: normalized, ...data } });
  }

  async addAllowedEmail(email: string, role: Role = 'CONSULTANT') {
    const normalized = normalizeEmail(email);
    const selectedRole = parseRole(role);
    return this.prisma.$transaction(async tx => {
      const allowedEmail = await updateAllowedEmailRole(tx, normalized, selectedRole, { mode: 'activate' });
      await this.grantUser(tx, normalized, selectedRole);
      return allowedEmail;
    });
  }

  async submitOnboardingRequest(
    name: string,
    email: string,
    requestedRole: 'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT',
  ) {
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    const normalizedEmail = normalizeEmail(email);
    parseRole(requestedRole);

    return this.prisma.$transaction(async tx => {
      const existing = await tx.onboardingRequest.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        const updated = await tx.onboardingRequest.updateMany({
          where: { id: existing.id, status: 'PENDING' },
          data: { name: normalizedName, requestedRole },
        });
        if (!updated.count) throw new ConflictException('Contact an administrator about your existing access request');
        return tx.onboardingRequest.findUnique({ where: { id: existing.id } });
      }
      return tx.onboardingRequest.create({
        data: { name: normalizedName, email: normalizedEmail, requestedRole, status: 'PENDING' },
      });
    });
  }

  async listOnboardingRequests() {
    return this.prisma.onboardingRequest.findMany({
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
      await this.grantUser(tx, email, role, request.name);
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

  async removeAllowedEmail(email: string) {
    return this.prisma.allowedEmail.updateMany({
      where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } },
      data: { active: false },
    });
  }
}
