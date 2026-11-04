import { Injectable, NotFoundException } from '@nestjs/common';
import type { ChatMessage } from '../model/model-client';

const HISTORY_LIMIT = 40; // messages sent back to the model per turn
 
 type StoredMessage = { message: ChatMessage; createdAt: number; meta?: Record<string, unknown> };
 type Conversation = { id: string; userId: string; projectId: string; sprintId?: string; messages: StoredMessage[] };
 
 /**
  * In-memory chat history for part 2: history works within one server run and
  * is lost on restart. Part 4 swaps this for a Prisma-backed version with the
  * same method signatures, so AgentService doesn't change.
  */
 @Injectable()
 export class ConversationStore {
   private readonly conversations = new Map<string, Conversation>();
   private counter = 0;
 
   /** Returns this user's conversation in this project, or creates a new one. */
   async open(input: { userId: string; projectId: string; sprintId?: string; conversationId?: string }) {
     if (input.conversationId) {
       const convo = this.conversations.get(input.conversationId);
       if (!convo || convo.userId !== input.userId || convo.projectId !== input.projectId) {
         throw new NotFoundException('Conversation not found');
       }
       return { id: convo.id };
     }
     const id = `conv_${Date.now().toString(36)}_${++this.counter}`;
     this.conversations.set(id, { id, userId: input.userId, projectId: input.projectId, sprintId: input.sprintId, messages: [] });
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
 
   /** User messages sent in the last hour, for the per-user rate limit. */
   async userMessagesLastHour(userId: string) {
     const since = Date.now() - 60 * 60 * 1000;
     let count = 0;
     for (const c of this.conversations.values()) {
       if (c.userId !== userId) continue;
       count += c.messages.filter((m) => m.message.role === 'user' && m.createdAt >= since).length;
     }
     return count;
   }
 }