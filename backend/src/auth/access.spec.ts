import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PeopleService } from './people.service';
import { getVerifiedEmail } from './verified-identity';
import { getVerifiedUser } from '../common/utils/verify';
import { ProjectsService } from '../projects/projects.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsController } from '../notifications/notifications.controller';
import { SlideSubmissionsController } from '../slide-submissions/slide-submissions.controller';
import { SlideSubmissionsService } from '../slide-submissions/slide-submissions.service';
import { SlackController } from '../integrations/slack.controller';
import { SlackService } from '../integrations/slack.service';
import { accessFixture, grant, request, user } from './testing/access-fixture';
import { Role } from '@prisma/client';

jest.mock('../common/utils/verify', () => ({ getVerifiedUser: jest.fn(async (token: string) => {
  if (token === 'verified-person') return 'person@illinois.edu';
  throw new Error('Invalid Microsoft token');
}) }));

const email = 'person@illinois.edu';
const states = [
  { label: 'never requested', status: 'not_requested', seed: {} },
  { label: 'legacy profile without approval', status: 'not_requested', seed: { users: [user()] } },
  { label: 'pending', status: 'pending', seed: { users: [user()], requests: [request()] } },
  { label: 'rejected', status: 'rejected', seed: { users: [user()], requests: [request(email, 'REJECTED')] } },
  { label: 'inactive profile', status: 'inactive', seed: { users: [{ ...user(), active: false }], grants: [grant()] } },
  { label: 'revoked grant', status: 'revoked', seed: { users: [user()], grants: [{ ...grant(), active: false }] } },
  { label: 'approved request missing grant', status: 'revoked', seed: { users: [user()], requests: [request(email, 'APPROVED')] } },
  { label: 'ambiguous approval', status: 'review_required', seed: { grants: [grant(), grant('PERSON@illinois.edu')] } },
  { label: 'ambiguous profiles', status: 'review_required', seed: { grants: [grant()], users: [user(), user('PERSON@illinois.edu')] } },
];

describe('canonical CMS access', () => {
  test.each(states)('denies $label before any User write', async ({ status, seed }) => {
    const f = accessFixture(structuredClone(seed)), auth = new AuthService(f.prisma);
    expect(await auth.getAccessStatus(email)).toMatchObject({ accessStatus: status, hasCmsAccess: false });
    await expect(auth.getUserFromAuthorization('Bearer verified-person')).rejects.toMatchObject({
      response: { code: 'CMS_ACCESS_DENIED', accessStatus: status },
    });
    await expect(auth.syncUserWithDatabase(email, 'Forged Name')).rejects.toBeInstanceOf(ForbiddenException);
    expect(await auth.getAllowedEmails()).toEqual([]);
    expect(await auth.findApprovedUserByEmail(email)).toBeNull();
    for (const write of [f.db.user.create, f.db.user.update, f.db.user.updateMany, f.db.user.upsert]) expect(write).not.toHaveBeenCalled();
  });

  test.each(Object.values(Role))('preserves an intentional direct %s grant across repeated logins', async role => {
    const f = accessFixture({ users: [user()], grants: [grant(email, role)] });
    const auth = new AuthService(f.prisma);
    expect((await auth.getUserFromAuthorization('Bearer verified-person')).role).toBe(role);
    expect((await auth.getUserFromAuthorization('Bearer verified-person')).role).toBe(role);
    expect(f.state.users[0].role).toBe(role);
    expect(await auth.getAccessStatus(email)).toMatchObject({ accessStatus: 'approved', requestStatus: null, hasCmsAccess: true, role });
    expect(await auth.getAllowedEmails()).toHaveLength(1);
  });

  test('provisions only an approved verified identity; status and recipient lookup do not provision', async () => {
    const f = accessFixture({ grants: [grant(email, 'LC')] }), auth = new AuthService(f.prisma);
    expect(await auth.getAccessStatus(email)).toMatchObject({ hasCmsAccess: true, profileActive: null, role: 'LC' });
    expect(await auth.findApprovedUserByEmail(email)).toBeNull();
    expect(f.state.users).toHaveLength(0);
    expect(await auth.getUserFromAuthorization('Bearer verified-person')).toMatchObject({ role: 'LC', email, active: true });
    expect(f.state.users).toHaveLength(1);
  });

  test('rejects the same verified session after revocation or profile deactivation', async () => {
    const f = accessFixture({ users: [user()], grants: [grant()] }), auth = new AuthService(f.prisma);
    await expect(auth.getUserFromAuthorization('Bearer verified-person')).resolves.toHaveProperty('email', email);
    await auth.removeAllowedEmail('PERSON@ILLINOIS.EDU');
    await expect(auth.getUserFromAuthorization('Bearer verified-person')).rejects.toMatchObject({ response: { accessStatus: 'revoked' } });
    f.state.grants[0].active = true;
    f.state.users[0].active = false;
    await expect(auth.getUserFromAuthorization('Bearer verified-person')).rejects.toMatchObject({ response: { accessStatus: 'inactive' } });
  });

  test('a direct administrator grant is authoritative even with an old rejected request', async () => {
    const f = accessFixture({ requests: [request(email, 'REJECTED')], users: [{ ...user(), active: false }] });
    const auth = new AuthService(f.prisma);
    await auth.addAllowedEmail('PERSON@illinois.edu', 'PM');
    expect(await auth.getUserFromAuthorization('Bearer verified-person')).toMatchObject({ role: 'PM', active: true });
    expect(await auth.getAccessStatus(email)).toMatchObject({ accessStatus: 'approved', requestStatus: 'REJECTED', accessApproved: true });
    expect(f.transaction).toHaveBeenCalledTimes(2);
  });

  test('approval commits the granted role and active User/access records; login keeps that role', async () => {
    const f = accessFixture({ requests: [request()], users: [{ ...user(), active: false }] });
    const auth = new AuthService(f.prisma);
    await auth.approveOnboardingRequest(email, 'synthetic-reviewer', 'Reviewed', 'LC');
    expect(f.transaction).toHaveBeenCalledTimes(1);
    expect(f.state.requests[0]).toMatchObject({ status: 'APPROVED', grantedRole: 'LC', requestedRole: 'CONSULTANT' });
    expect(f.state.grants[0]).toMatchObject({ role: 'LC', active: true });
    expect(f.state.users[0]).toMatchObject({ role: 'LC', active: true });
    expect(await auth.getUserFromAuthorization('Bearer verified-person')).toHaveProperty('role', 'LC');
  });

  test('a direct grant provisions both records without an onboarding request', async () => {
    const f = accessFixture(), auth = new AuthService(f.prisma);
    await auth.addAllowedEmail(email, 'EXECUTIVE');
    expect(f.state.users[0]).toMatchObject({ email, role: 'EXECUTIVE', active: true });
    expect(f.state.grants[0]).toMatchObject({ email, role: 'EXECUTIVE', active: true });
    expect(f.state.requests).toEqual([]);
    expect(await auth.getUserFromAuthorization('Bearer verified-person')).toHaveProperty('role', 'EXECUTIVE');
  });

  test('a legacy null-role grant keeps the approved CONSULTANT default', async () => {
    const f = accessFixture({ users: [user(email, 'ADMIN')], grants: [grant(email, null)] });
    expect(await new AuthService(f.prisma).getUserFromAuthorization('Bearer verified-person')).toHaveProperty('role', 'CONSULTANT');
  });

  test('ambiguous profiles require review instead of a partial grant', async () => {
    const f = accessFixture({ users: [user(), user('PERSON@illinois.edu')] });
    await expect(new AuthService(f.prisma).addAllowedEmail(email, 'ADMIN')).rejects.toBeInstanceOf(ConflictException);
    expect(f.state.grants).toEqual([]);
    expect(f.state.users.every(person => person.role === 'CONSULTANT')).toBe(true);
  });

  test.each(['approve', 'direct grant'])('%s rolls back when User provisioning fails', async action => {
    const f = accessFixture({ requests: [request()] }), auth = new AuthService(f.prisma);
    f.db.user.create.mockRejectedValue(new Error('Synthetic write failure'));
    await expect(action === 'approve' ? auth.approveOnboardingRequest(email, 'reviewer', undefined, 'PM')
      : auth.addAllowedEmail(email, 'PM')).rejects.toThrow('Synthetic write failure');
    expect(f.state.grants).toEqual([]);
    expect(f.state.users).toEqual([]);
    expect(f.state.requests[0].status).toBe('PENDING');
    expect(f.transaction).toHaveBeenCalledTimes(1);
  });

  test('role editing cannot silently approve a legacy User or reactivate revoked access', async () => {
    const f = accessFixture({ users: [user()] });
    const people = new PeopleService(f.prisma), auth = new AuthService(f.prisma);
    await people.changeRole(email, 'ADMIN');
    expect(f.state.grants).toEqual([]);
    expect(await auth.isEmailAllowed(email)).toBe(false);
    f.state.grants.push({ ...grant(), active: false });
    await people.changeRole(email, 'LC');
    expect(f.state.grants[0]).toMatchObject({ role: 'LC', active: false });
  });

  test('a public request cannot reset an administrator-reviewed request', async () => {
    const f = accessFixture({ requests: [request(email, 'APPROVED')], grants: [grant(email, 'PM')] });
    const auth = new AuthService(f.prisma);
    await expect(auth.submitOnboardingRequest('Changed', email, 'ADMIN')).rejects.toBeInstanceOf(ConflictException);
    expect(f.state.requests[0].status).toBe('APPROVED');
    expect(f.state.grants[0].role).toBe('PM');
  });

  test('People exposes independent profile/approval values and preserves existing names/teams fields', async () => {
    const f = accessFixture({
      users: [user(), { ...user('inactive@illinois.edu'), active: false }, user('approved@illinois.edu', 'PM')],
      grants: [grant('inactive@illinois.edu'), grant('approved@illinois.edu', 'PM')],
      requests: [request()],
    });
    const people = await new PeopleService(f.prisma).list();
    expect(people.find(p => p.email === email)).toMatchObject({ active: true, profileActive: true,
      accessApproved: false, accessStatus: 'pending', hasCmsAccess: false, firstName: 'Synthetic', teams: [] });
    expect(people.find(p => p.email.startsWith('inactive'))).toMatchObject({ active: false, profileActive: false,
      accessApproved: true, hasCmsAccess: false, accessStatus: 'inactive' });
    expect(people.find(p => p.email.startsWith('approved'))).toMatchObject({ accessRole: 'PM', hasCmsAccess: true });
    expect((await new AuthService(f.prisma).getAllowedEmails()).map(p => p.email)).toEqual(['approved@illinois.edu']);
  });
});

describe('verified identity and retained authentication paths', () => {
  test.each([undefined, '', email, 'Bearer ' + email, 'Basic verified-person', 'Bearer invalid-token'])('rejects invalid credentials %s', async header => {
    await expect(getVerifiedEmail(header)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  test('email credentials never reach Microsoft verification', async () => {
    jest.mocked(getVerifiedUser).mockClear();
    await expect(getVerifiedEmail('Bearer person@illinois.edu')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(getVerifiedUser).not.toHaveBeenCalled();
  });

  test('sync uses the verified caller and ignores untrusted provider IDs', async () => {
    const f = accessFixture({ users: [user(), user('other@illinois.edu')], grants: [grant()] });
    const auth = new AuthService(f.prisma), controller = new AuthController(auth);
    const caller = f.state.users[0];
    await expect(controller.syncUser({ email: 'other@illinois.edu', googleId: 'other-id' }, caller))
      .rejects.toBeInstanceOf(ForbiddenException);
    await controller.syncUser({ email, googleId: 'other-id', name: 'Updated Person' }, caller);
    expect(f.state.users[0]).toMatchObject({ email, firstName: 'Updated', googleId: null });
    expect(f.state.users[1]).toMatchObject({ email: 'other@illinois.edu', firstName: 'Synthetic', googleId: null });
  });

  test.each(['notifications', 'slides', 'slack'])('%s rejects email impersonation and revoked sessions before protected service calls', async kind => {
    const f = accessFixture({ users: [user()], grants: [grant()] }), auth = new AuthService(f.prisma);
    const protectedRead = jest.fn().mockResolvedValue([]);
    const run = kind === 'notifications'
      ? (header: string) => new NotificationsController({ getNotificationsForUser: protectedRead } as unknown as NotificationsService, auth).getMyNotifications(header)
      : kind === 'slides'
        ? (header: string) => new SlideSubmissionsController({ getMySubmissions: protectedRead } as unknown as SlideSubmissionsService, auth).getMySubmissions(header)
        : (header: string) => new SlackController({ getUserConnections: protectedRead } as unknown as SlackService, auth).getConnections(header);
    await expect(run('Bearer ' + email)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(protectedRead).not.toHaveBeenCalled();
    await run('Bearer verified-person');
    expect(protectedRead).toHaveBeenCalledTimes(1);
    f.state.grants[0].active = false;
    await expect(run('Bearer verified-person')).rejects.toBeInstanceOf(ForbiddenException);
    expect(protectedRead).toHaveBeenCalledTimes(1);
  });

  test('Slack OAuth completion rechecks access for the initiating user', async () => {
    const f = accessFixture({ users: [user()], grants: [{ ...grant(), active: false }] });
    const exchange = jest.fn();
    const slack = { getValidOAuthState: jest.fn().mockResolvedValue({ userId: email, purpose: 'CONNECT' }), exchangeOAuthCode: exchange };
    await expect(new SlackController(slack as unknown as SlackService, new AuthService(f.prisma)).oauthCallback('code', 'state'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(exchange).not.toHaveBeenCalled();
  });
});

describe('team membership uses the access policy even for existing User IDs', () => {
  test.each([true, false])('adds an approved identity with existing profile=%s', async existing => {
    const f = accessFixture({ users: existing ? [user()] : [], grants: [grant()] });
    const create = jest.fn().mockResolvedValue({ id: 'synthetic-membership' });
    Object.assign(f.prisma, { projectMember: { findFirst: jest.fn().mockResolvedValue(null), create } });
    const projects = new ProjectsService(f.prisma, {} as NotificationsService);
    expect(await projects.addMember('synthetic-project', existing ? { userId: email } : { email })).toHaveProperty('id', 'synthetic-membership');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: { projectId: 'synthetic-project', userId: f.state.users[0].id } }));
    expect(f.state.users[0]).toMatchObject({ active: true, role: 'CONSULTANT' });
  });
  test.each(states.filter(s => s.label !== 'ambiguous profiles'))('cannot add $label', async ({ seed }) => {
    const f = accessFixture({ ...structuredClone(seed), users: seed.users ?? [user()] });
    const projects = new ProjectsService(f.prisma, {} as NotificationsService);
    await expect(projects.addMember('synthetic-project', { userId: email })).rejects.toBeInstanceOf(BadRequestException);
  });
  test('cannot create a team containing an unapproved existing profile', async () => {
    const f = accessFixture({ users: [user(), user('pm@illinois.edu', 'PM')], grants: [grant('pm@illinois.edu', 'PM')] });
    const projects = new ProjectsService(f.prisma, {} as NotificationsService);
    await expect(projects.create({ name: 'Synthetic', startDate: '2026-10-21', memberIds: [email] }, 'pm@illinois.edu'))
      .rejects.toThrow('Team members must have active approved CMS access');
  });
});
