import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { ChatMessage, MODEL_CLIENT, ModelClient } from '../model/model-client';
import { SkillLibrary } from '../skills/skill-library';
import { ToolRegistry } from '../tools/tool-registry';
import type { ToolContext } from '../tools/tool.types';
import { featureDisabled, userRateLimited } from './agent-errors';
import type { AgentSource } from './agent.events';
import type { AgentUser, RunInput, SendEvent } from './agent.types';
import { ConversationStore } from './conversation.store';
import { buildSystemPrompt } from './prompt';

export const MAX_ROUNDS = 6;
export const DEFAULT_MAX_MESSAGES_PER_HOUR = 60;

@Injectable()
export class AgentService {
  constructor(
    @Inject(MODEL_CLIENT) private readonly model: ModelClient,
    private readonly store: ConversationStore,
    private readonly flags: FeatureFlagsService,
    private readonly tools: ToolRegistry,
    private readonly skills: SkillLibrary,
    private readonly config: ConfigService,
  ) {}

  /** docs/agentic-cms.md: recheck before each new model or tool operation. */
  private assertStillEnabled(user: AgentUser) {
    try {
      this.flags.assertAgenticCmsEnabledFor(user.email);
    } catch {
      throw featureDisabled();
    }
  }

  private maxMessagesPerHour() {
    const configured = Number(this.config.get<string>('OTCR_BOT_MAX_MESSAGES_PER_HOUR'));
    return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_MESSAGES_PER_HOUR;
  }

  async run(input: RunInput, send: SendEvent) {
    // 1. Flag + rate limit before doing any work.
    this.assertStillEnabled(input.user);
    if ((await this.store.userMessagesLastHour(input.user.id)) >= this.maxMessagesPerHour()) throw userRateLimited();

    // 2. Find or create the conversation and tell the browser its id.
    const convo = await this.store.open({
      userId: input.user.id,
      projectId: input.projectId,
      sprintId: input.sprintId,
      conversationId: input.conversationId,
    });
    send({ type: 'conversation', id: convo.id });

    // 3. Build what the model sees: earlier turns + this message, available tools and skills.
    const history = await this.store.history(convo.id);
    const userMsg: ChatMessage = { role: 'user', content: input.message };
    const turnMessages: ChatMessage[] = [userMsg];
    const tools = await this.tools.available();
    const skills = tools.some((t) => t.name === 'load_skill') ? await this.skills.list() : [];
    const system = buildSystemPrompt({
      user: input.user,
      projectId: input.projectId,
      sprintId: input.sprintId,
      today: new Date().toISOString().slice(0, 10),
      tools: tools.map((t) => t.name),
      skills,
    });
    const schemas = this.tools.schemas(tools);

    // Sources cited in this answer, numbered [1], [2]… in the order tools found them.
    const sources: AgentSource[] = [];
    const ctx: ToolContext = {
      user: input.user,
      projectId: input.projectId,
      sprintId: input.sprintId,
      signal: input.signal,
      addSources: (found) =>
        found.map((s) => {
          const existing = sources.find((x) => x.url === s.url);
          if (existing) return existing.id;
          const source = { id: sources.length + 1, title: s.title, url: s.url };
          sources.push(source);
          return source.id;
        }),
    };

    // 4. The loop: ask the model; if it wants tools, run them and ask again.
    let streamedText = false;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        this.assertStillEnabled(input.user);
        let roundText = false;
        const turn = await this.model.stream(
          { system, messages: [...history, ...turnMessages], tools: schemas, signal: input.signal },
          (delta) => {
            // Separate text written before a tool call from the text after it.
            if (!roundText && streamedText) send({ type: 'text_delta', text: '\n\n' });
            roundText = streamedText = true;
            send({ type: 'text_delta', text: delta });
          },
        );
        turnMessages.push(turn.message);
        if (!turn.toolCalls.length) break; // model answered: done

        if (round === MAX_ROUNDS - 1) {
          send({ type: 'text_delta', text: '\n\n_(Stopped after too many steps. Try a more specific question.)_' });
          break;
        }

        for (const call of turn.toolCalls) {
          this.assertStillEnabled(input.user); // also covers external calls such as web search
          const before = sources.length;
          const content = await this.tools.execute(call, tools, ctx, send);
          turnMessages.push({ role: 'tool', tool_call_id: call.id, content });
          if (sources.length !== before) send({ type: 'sources', sources: [...sources] });
        }
      }
    } catch (err) {
      // Keep the user's message so the conversation isn't lost; drop the half-finished turn.
      await this.store.append(convo.id, [userMsg]).catch(() => undefined);
      throw err;
    }

    // 5. Save the finished turn (with its sources, for the history UI later).
    await this.store.append(convo.id, turnMessages, sources.length ? { sources } : undefined);
  }
}
