import { AllowedEmail, OnboardingRequest, Role, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export function user(email = 'person@illinois.edu', role: Role = 'CONSULTANT'): User {
  return { id: email, email, googleId: null, firstName: 'Synthetic', lastName: 'Person',
    role, active: true, createdAt: new Date(), updatedAt: new Date() };
}
export function grant(email = 'person@illinois.edu', role: Role | null = 'CONSULTANT'): AllowedEmail {
  return { id: email, email, role, active: true, createdAt: new Date(), updatedAt: new Date() };
}
export function request(email = 'person@illinois.edu', status: OnboardingRequest['status'] = 'PENDING'): OnboardingRequest {
  return { id: email, email, name: 'Synthetic Person', status, requestedRole: 'CONSULTANT', grantedRole: null,
    reviewedAt: null, reviewedById: null, reviewerNotes: null, createdAt: new Date(), updatedAt: new Date() };
}

type State = { users: User[]; grants: AllowedEmail[]; requests: OnboardingRequest[] };
type Where = { id?: string; email?: string | { equals: string; mode?: string }; status?: string };
type Row = { id: string; email: string; status?: string };
function matches(row: Row, where: Where = {}) {
  return (!where.id || row.id === where.id)
    && (!where.status || row.status === where.status)
    && (!where.email || (typeof where.email === 'string' ? row.email === where.email
      : row.email.toLowerCase() === where.email.equals.toLowerCase()));
}

// Synthetic state at the Prisma boundary; no database, credentials or real accounts.
// The rollback model verifies that service writes stay inside one transaction.
export function accessFixture(seed: Partial<State> = {}) {
  const state: State = { users: [], grants: [], requests: [], ...seed };
  let sequence = 0;
  function delegate<T extends Row>(rows: () => T[], defaults: () => T) {
    const model = {
      findMany: jest.fn(async (args: { where?: Where; select?: unknown; orderBy?: unknown } = {}) =>
        rows().filter(row => matches(row, args.where)).map(row => ({ ...row, projectAssignments: [], pmProjects: [] }))),
      findUnique: jest.fn(async ({ where }: { where: Where }) => rows().find(row => matches(row, where)) ?? null),
      findFirst: jest.fn(async ({ where }: { where: Where }) => rows().find(row => matches(row, where)) ?? null),
      findFirstOrThrow: jest.fn(async ({ where }: { where: Where }) => {
        const row = rows().find(row => matches(row, where));
        if (!row) throw new Error('Record missing');
        return row;
      }),
      create: jest.fn(async ({ data }: { data: Partial<T> }) => {
        const row = { ...defaults(), id: 'synthetic-' + ++sequence, ...data };
        if (rows().some(existing => existing.email === row.email)) throw new Error('Unique email');
        rows().push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: Where; data: Partial<T> }) => {
        const row = rows().find(row => matches(row, where));
        if (!row) throw new Error('Record missing');
        Object.assign(row, data); return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Where; data: Partial<T> }) => {
        const found = rows().filter(row => matches(row, where));
        found.forEach(row => Object.assign(row, data));
        return { count: found.length };
      }),
      upsert: jest.fn(async ({ where, update, create }: { where: Where; update: Partial<T>; create: Partial<T> }) => {
        const row = rows().find(row => matches(row, where));
        return row ? model.update({ where, data: update }) : model.create({ data: create });
      }),
    };
    return model;
  }
  const db = {
    user: delegate(() => state.users, user),
    allowedEmail: delegate(() => state.grants, grant),
    onboardingRequest: delegate(() => state.requests, request),
  };
  const prisma = { ...db, $transaction: jest.fn(async (action: (tx: typeof db) => Promise<unknown>) => {
    const before = structuredClone(state);
    try { return await action(db); }
    catch (error) { Object.assign(state, before); throw error; }
  }) };
  return { state, db, prisma: prisma as unknown as PrismaService, transaction: prisma.$transaction };
}
