import { Inject, Injectable } from '@nestjs/common';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { featureDisabled, userRateLimited } from './agent-errors';
import type { AgentUser, RunInput, SendEvent } from './agent.types';
import { ConversationStore } from './conversation.store';
import { ChatMessage, MODEL_CLIENT, ModelClient } from '../model/model-client';
import { buildSystemPrompt } from './prompt';

export const MAX_ROUNDS = 6;
export const DEFAULT_MAX_MESSAGES_PER_HOUR = 60;

@Injectable()
export class AgentService {
  constructor(
    @Inject(MODEL_CLIENT) private readonly model: ModelClient,
    private readonly store: ConversationStore,
    private readonly flags: FeatureFlagsService,
  ) {}

    /** docs/agentic-cms.md: recheck before each new model or tool operation. */
    private assertStillEnabled(user: AgentUser) {
        try {
          this.flags.assertAgenticCmsEnabledFor(user.email);
        } catch {
          throw featureDisabled();
        }
      }
     
      async run(input: RunInput, send: SendEvent) {
        // 1. Flag + rate limit before doing any work.
        this.assertStillEnabled(input.user);
        const limit = Number(process.env.OTCR_BOT_MAX_MESSAGES_PER_HOUR || DEFAULT_MAX_MESSAGES_PER_HOUR);
        if ((await this.store.userMessagesLastHour(input.user.id)) >= limit) throw userRateLimited();
    
        // 2. Find or create the conversation and tell the browser its id.
        const convo = await this.store.open({
          userId: input.user.id,
          projectId: input.projectId,
          sprintId: input.sprintId,
          conversationId: input.conversationId,
        });
        send({ type: 'conversation', id: convo.id });
    
        // 3. Build what the model sees: earlier turns + this message.
        const history = await this.store.history(convo.id);
        const userMsg: ChatMessage = { role: 'user', content: input.message };
        const turnMessages: ChatMessage[] = [userMsg];
        const system = buildSystemPrompt({
          user: input.user,
          projectId: input.projectId,
          sprintId: input.sprintId,
          today: new Date().toISOString().slice(0, 10),
        });
    
        // 4. The loop: ask the model; if it wants tools, run them and ask again.
        try {
          for (let round = 0; round < MAX_ROUNDS; round++) {
            this.assertStillEnabled(input.user);
            const turn = await this.model.stream(
              { system, messages: [...history, ...turnMessages], tools: [], signal: input.signal },
              (delta) => send({ type: 'text_delta', text: delta }),
            );
            turnMessages.push(turn.message);
            if (!turn.toolCalls.length) break; // model answered: done
    
            if (round === MAX_ROUNDS - 1) {
              send({ type: 'text_delta', text: '\n\n_(Stopped after too many steps. Try a more specific question.)_' });
              break;
            }
    
            for (const call of turn.toolCalls) {
              this.assertStillEnabled(input.user);
              send({ type: 'tool_start', id: call.id, name: call.name, label: `Running ${call.name}…` });
              // Part 3 replaces this with the tool registry. No tools exist yet.
              const content = `Unknown tool "${call.name}". No tools are available yet.`;
              send({ type: 'tool_end', id: call.id, ok: false, note: 'Tool not available' });
              turnMessages.push({ role: 'tool', tool_call_id: call.id, content });
            }
          }
        } catch (err) {
          // Keep the user's message so the conversation isn't lost; drop the half-finished turn.
          await this.store.append(convo.id, [userMsg]).catch(() => undefined);
          throw err;
        }
    
        // 5. Save the finished turn.
        await this.store.append(convo.id, turnMessages);
      }
}