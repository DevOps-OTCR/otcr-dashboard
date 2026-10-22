import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SlackService } from './slack.service';

describe('Slack OAuth states created through verified CMS authentication', () => {
  function fixture() {
    const state = { create: jest.fn().mockResolvedValue({}), findUnique: jest.fn() };
    const prisma = { slackOAuthState: state } as unknown as PrismaService;
    const service = new SlackService({ get: () => undefined } as unknown as ConfigService, prisma);
    return { state, service };
  }
  test('marks newly issued opaque states and keeps their expiration', async () => {
    const { state, service } = fixture();
    const token = await service.createOAuthState('synthetic-person', 'CONNECT');
    expect(token).toMatch(/^cms-verified-v1:[a-f0-9]{48}$/);
    expect(state.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      state: token, userId: 'synthetic-person', purpose: 'CONNECT', expiresAt: expect.any(Date),
    }) });
  });
  test('rejects retained states from the email-only authentication path', async () => {
    const { state, service } = fixture();
    await expect(service.getValidOAuthState('a'.repeat(48))).rejects.toBeInstanceOf(BadRequestException);
    expect(state.findUnique).not.toHaveBeenCalled();
  });
  test('the version marker alone does not prove a valid state', async () => {
    const { state, service } = fixture();
    state.findUnique.mockResolvedValue(null);
    await expect(service.getValidOAuthState('cms-verified-v1:forged')).rejects.toThrow('Invalid Slack OAuth state');
  });
  test('accepts a stored, unused, unexpired state while preserving expiry and single-use checks', async () => {
    const { state, service } = fixture();
    const stored = { state: 'cms-verified-v1:synthetic', usedAt: null, expiresAt: new Date(Date.now() + 60_000) };
    state.findUnique.mockResolvedValue(stored);
    await expect(service.getValidOAuthState(stored.state)).resolves.toEqual(stored);
    stored.expiresAt = new Date(0);
    await expect(service.getValidOAuthState(stored.state)).rejects.toThrow('expired');
    state.findUnique.mockResolvedValue({ ...stored, usedAt: new Date() });
    await expect(service.getValidOAuthState(stored.state)).rejects.toThrow('already been used');
  });
});
