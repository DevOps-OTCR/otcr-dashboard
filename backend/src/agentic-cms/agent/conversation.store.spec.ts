import { NotFoundException } from '@nestjs/common';
import { ConversationStore } from './conversation.store';
import type { ChatMessage } from '../model/model-client';

// Spec for the in-memory ConversationStore (part 4 swaps in Prisma with the
// same methods, so these tests describe the contract both must meet).

const u = (content: string): ChatMessage => ({ role: 'user', content });
const a = (content: string): ChatMessage => ({ role: 'assistant', content });

describe('ConversationStore', () => {
  it('creates a new conversation with a unique id', async () => {
    const store = new ConversationStore();
    const one = await store.open({ userId: 'u1', projectId: 'p1' });
    const two = await store.open({ userId: 'u1', projectId: 'p1' });
    expect(one.id).toEqual(expect.any(String));
    expect(one.id).not.toBe(two.id);
  });

  it('reopens an existing conversation for the same user and project', async () => {
    const store = new ConversationStore();
    const { id } = await store.open({ userId: 'u1', projectId: 'p1' });
    await expect(store.open({ userId: 'u1', projectId: 'p1', conversationId: id })).resolves.toEqual({ id });
  });

  it.each([
    ['another user', { userId: 'u2', projectId: 'p1' }],
    ['another project', { userId: 'u1', projectId: 'p2' }],
  ])("returns 404 when %s asks for someone else's conversation", async (_label, who) => {
    const store = new ConversationStore();
    const { id } = await store.open({ userId: 'u1', projectId: 'p1' });
    await expect(store.open({ ...who, conversationId: id })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 for an id that does not exist', async () => {
    const store = new ConversationStore();
    await expect(store.open({ userId: 'u1', projectId: 'p1', conversationId: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns appended messages in order', async () => {
    const store = new ConversationStore();
    const { id } = await store.open({ userId: 'u1', projectId: 'p1' });
    await store.append(id, [u('one'), a('two')]);
    await store.append(id, [u('three')]);
    expect(await store.history(id)).toEqual([u('one'), a('two'), u('three')]);
  });

  it('keeps conversations separate', async () => {
    const store = new ConversationStore();
    const c1 = await store.open({ userId: 'u1', projectId: 'p1' });
    const c2 = await store.open({ userId: 'u1', projectId: 'p1' });
    await store.append(c1.id, [u('first convo')]);
    expect(await store.history(c2.id)).toEqual([]);
  });

  it('returns only the 40 most recent messages', async () => {
    const store = new ConversationStore();
    const { id } = await store.open({ userId: 'u1', projectId: 'p1' });
    await store.append(id, Array.from({ length: 45 }, (_, i) => u(`m${i}`)));
    const history = await store.history(id);
    expect(history).toHaveLength(40);
    expect(history[0]).toEqual(u('m5'));
    expect(history[39]).toEqual(u('m44'));
  });

  it('never starts history on a tool result whose request was cut off', async () => {
    const store = new ConversationStore();
    const { id } = await store.open({ userId: 'u1', projectId: 'p1' });
    const tool: ChatMessage = { role: 'tool', tool_call_id: 'c1', content: 'result' };
    // 41 messages: the 40-message window starts on the two tool results, whose
    // assistant request ('cut') fell outside it. Those must be dropped.
    await store.append(id, [u('cut'), tool, tool, ...Array.from({ length: 38 }, (_, i) => u(`k${i}`))]);
    const window = await store.history(id);
    expect(window[0].role).not.toBe('tool');
    expect(window[0]).toEqual(u('k0'));
    expect(window).toHaveLength(38);
  });

  it('ignores appends to an unknown conversation instead of throwing', async () => {
    const store = new ConversationStore();
    await expect(store.append('missing', [u('x')])).resolves.toBeUndefined();
  });

  describe('userMessagesLastHour', () => {
    afterEach(() => jest.useRealTimers());

    it("counts only this user's own user-role messages", async () => {
      const store = new ConversationStore();
      const mine = await store.open({ userId: 'u1', projectId: 'p1' });
      const mine2 = await store.open({ userId: 'u1', projectId: 'p2' });
      const theirs = await store.open({ userId: 'u2', projectId: 'p1' });
      await store.append(mine.id, [u('1'), a('r'), u('2')]);
      await store.append(mine2.id, [u('3')]);
      await store.append(theirs.id, [u('x'), u('y')]);
      expect(await store.userMessagesLastHour('u1')).toBe(3);
      expect(await store.userMessagesLastHour('u2')).toBe(2);
      expect(await store.userMessagesLastHour('nobody')).toBe(0);
    });

    it('does not count messages older than an hour', async () => {
      jest.useFakeTimers({ now: new Date('2026-11-03T10:00:00Z') });
      const store = new ConversationStore();
      const { id } = await store.open({ userId: 'u1', projectId: 'p1' });
      await store.append(id, [u('early')]);
      jest.setSystemTime(new Date('2026-11-03T11:30:00Z'));
      await store.append(id, [u('recent')]);
      expect(await store.userMessagesLastHour('u1')).toBe(1);
    });
  });
});