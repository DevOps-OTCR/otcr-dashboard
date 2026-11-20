import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 100;

export type ApprovalOwner = { userId: string; projectId: string; conversationId: string };
export type StoredWrite = { toolName: string; input: unknown; binding: string };

type Entry = ApprovalOwner & StoredWrite & { expiresAt: number };

/**
 * Write calls waiting for the user's approval. A tool that writes to an outside system does not
 * run when the model calls it: the registry stores the validated call here and the user approves
 * it with a button. The approval id travels in the user's own request, never through model output.
 *
 * Process-local, like the duplicate guard and the PowerPoint snapshots: a restart or a second
 * instance forgets pending approvals and the user just asks again. Single use, 15 minutes.
 */
@Injectable()
export class WriteApprovals {
  private readonly entries = new Map<string, Entry>();

  create(owner: ApprovalOwner, write: StoredWrite): string {
    this.sweep();
    while (this.entries.size >= MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
    const id = randomUUID();
    this.entries.set(id, { ...owner, ...write, expiresAt: Date.now() + TTL_MS });
    return id;
  }

  /** Returns the stored call and removes it, or null if it is unknown, expired, used, or someone else's. */
  take(id: string, owner: ApprovalOwner): StoredWrite | null {
    this.sweep();
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (entry.userId !== owner.userId || entry.projectId !== owner.projectId || entry.conversationId !== owner.conversationId) return null;
    this.entries.delete(id);
    return { toolName: entry.toolName, input: entry.input, binding: entry.binding };
  }

  private sweep() {
    const now = Date.now();
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id);
  }
}
