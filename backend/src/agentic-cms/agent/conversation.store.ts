import { Injectable, NotFoundException } from '@nestjs/common';
import type { ChatMessage } from '../model/model-client';
import type { AgentSource } from './agent.events';

const HISTORY_LIMIT = 40; // messages sent back to the model per turn

type StoredMessage = { message: ChatMessage; createdAt: number; meta?: Record<string, unknown> };
type Conversation = {
  id: string;
  userId: string;
  projectId: string;
  sprintId?: string;
  messages: StoredMessage[];
  /** Every source seen in this conversation. A source's position fixes its [n] for good. */
  sources: AgentSource[];
};

/**
 * In-memory chat history for part 2: history works within one server run and
 * is lost on restart. Part 4 swaps this for a Prisma-backed version with the
 * same method signatures, so AgentService doesn't change.
 */
@Injectable()
export class ConversationStore {
  private readonly conversations = new Map<string, Conversation>();
  /** Per user: when each message slot in the last hour was taken. */
  private readonly reservations = new Map<string, number[]>();
  private counter = 0;

  /** Returns this user's conversation for this project and workstream, or creates a new one. */
  async open(input: { userId: string; projectId: string; sprintId?: string; conversationId?: string }) {
    if (input.conversationId) {
      const convo = this.conversations.get(input.conversationId);
      if (
        !convo ||
        convo.userId !== input.userId ||
        convo.projectId !== input.projectId ||
        (convo.sprintId || null) !== (input.sprintId || null) // "no workstream" is its own scope
      ) {
        throw new NotFoundException('Conversation not found');
      }
      return { id: convo.id };
    }
    const id = `conv_${Date.now().toString(36)}_${++this.counter}`;
    this.conversations.set(id, {
      id,
      userId: input.userId,
      projectId: input.projectId,
      sprintId: input.sprintId || undefined,
      messages: [],
      sources: [],
    });
    return { id };
  }

  async history(conversationId: string): Promise<ChatMessage[]> {
    const msgs = (this.conversations.get(conversationId)?.messages ?? []).slice(-HISTORY_LIMIT).map((m) => m.message);
    while (msgs.length && msgs[0].role === 'tool') msgs.shift(); // never start on an orphaned tool result
    return msgs;
  }

  async append(conversationId: string, messages: ChatMessage[], meta?: Record<string, unknown>) {
    const convo = this.conversations.get(conversationId);
    if (!convo) return;
    messages.forEach((message, i) =>
      convo.messages.push({ message, createdAt: Date.now(), ...(i === messages.length - 1 && meta ? { meta } : {}) }),
    );
  }

  /** Returns each source's permanent id, reusing the id of a URL this conversation already knows. */
  async addSources(conversationId: string, found: Omit<AgentSource, 'id'>[]): Promise<AgentSource[]> {
    const convo = this.conversations.get(conversationId);
    if (!convo) return [];
    return found.map(({ title, url }) => {
      const existing = convo.sources.find((s) => s.url === url);
      if (existing) return { ...existing };
      const source = { id: convo.sources.length + 1, title, url };
      convo.sources.push(source);
      return { ...source };
    });
  }

  async sources(conversationId: string): Promise<AgentSource[]> {
    return (this.conversations.get(conversationId)?.sources ?? []).map((s) => ({ ...s }));
  }

  /**
   * Takes one of the user's hourly message slots, or returns false when they are all used.
   * The slot is counted the moment it's taken, before any model call, so requests sent at
   * the same time can't all pass a check that only counted finished turns. Check and record
   * happen with no await between them; the Prisma version needs one atomic insert-if-under-limit.
   */
  async reserveMessage(userId: string, maxPerHour: number): Promise<boolean> {
    const since = Date.now() - 60 * 60 * 1000;
    const recent = (this.reservations.get(userId) ?? []).filter((at) => at >= since);
    if (recent.length >= maxPerHour) {
      this.reservations.set(userId, recent);
      return false;
    }
    recent.push(Date.now());
    this.reservations.set(userId, recent);
    return true;
  }
}
