import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../../../feature-flags/feature-flags.service';
import { assistantMessage, ChatMessage, MODEL_CLIENT, ModelClient, ModelRequest } from '../../../model/model-client';
import { SkillLibrary } from '../../../skills/skill-library';
import { ToolRegistry } from '../../../tools/tool-registry';
import type { ToolContext } from '../../../tools/tool.types';
import { AgentError, featureDisabled, userRateLimited } from '../../../agent/agent-errors';
import type { AgentSource } from '../../../agent/agent.events';
import type { AgentUser, RunInput, SendEvent } from '../../../agent/agent.types';
import { checkCitations } from '../../../agent/citations';
import { ConversationStore } from '../../../agent/conversation.store';
import { buildSystemPrompt } from '../../../agent/prompt';
import { countDraftWords, isTooShort, requestedWordLimit, wordLimitCorrection, wordLimitRetry } from '../../../agent/word-limit';

export const MAX_ROUNDS = 6;
export const DEFAULT_MAX_MESSAGES_PER_HOUR = 60;
const MAX_WORD_LIMIT_ATTEMPTS = 2; // the first cut plus one retry

@Injectable()
export class AgentService {
  private readonly log = new Logger('OtcrBotAgent');

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

    // Sources this turn's tools returned. Their [n] numbers come from the conversation's
    // registry, so a number means the same URL in every turn.
    const sources: AgentSource[] = [];
    const ctx: ToolContext = {
      user: input.user,
      projectId: input.projectId,
      sprintId: input.sprintId,
      signal: input.signal,
      addSources: async (found) => {
        const registered = await this.store.addSources(convo.id, found);
        for (const source of registered) if (!sources.some((x) => x.id === source.id)) sources.push(source);
        return registered.map((source) => source.id);
      },
    };

    // 4. The loop: ask the model; if it wants tools, run them and ask again.
    let shown = ''; // everything sent to the browser so far
    let answer = '';
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        this.assertStillEnabled(input.user);
        let roundText = false;
        const shownBefore = shown;
        const turn = await this.model.stream(
          { system, messages: [...history, ...turnMessages], tools: schemas, signal: input.signal },
          (delta) => {
            // Separate text written before a tool call from the text after it.
            if (!roundText && shown) {
              shown += '\n\n';
              send({ type: 'text_delta', text: '\n\n' });
            }
            roundText = true;
            shown += delta;
            send({ type: 'text_delta', text: delta });
          },
        );
        turnMessages.push(turn.message);

        if (!turn.toolCalls.length) {
          const final = await this.enforceWordLimit(input, { system, messages: [...history, ...turnMessages] }, turn.text, send);
          if (final !== turn.text) {
            turnMessages[turnMessages.length - 1] = assistantMessage(final, []);
            send({ type: 'text_replace', text: `${shownBefore}${shownBefore && final ? '\n\n' : ''}${final}` });
          }
          answer += final;
          break; // model answered: done
        }
        answer += turn.text;

        if (round === MAX_ROUNDS - 1) {
          // Every tool call in saved history needs a result, or the next turn is invalid.
          for (const call of turn.toolCalls) {
            turnMessages.push({ role: 'tool', tool_call_id: call.id, content: 'Not run: this reply reached its step limit.' });
          }
          const notice = '_(Stopped after too many steps. Try a more specific question.)_';
          turnMessages.push({ role: 'assistant', content: notice });
          send({ type: 'text_delta', text: `\n\n${notice}` });
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

    // 5. Sources stream as found so [n] links work live. The final list holds only the cited
    // ones, checked against the whole conversation so a follow-up can cite an earlier source.
    const registry = await this.store.sources(convo.id);
    const { cited, invalid } = checkCitations(answer, registry);
    if (sources.length || cited.length) send({ type: 'sources', sources: cited });
    if (invalid.length) this.log.warn(`Model cited unknown sources [${invalid.join(', ')}] in ${convo.id}`);

    // 6. Save the finished turn (with its sources, for the history UI later).
    await this.store.append(convo.id, turnMessages, cited.length ? { sources: cited } : undefined);
  }

  /**
   * Counts the finished draft against a word limit the user asked for and, if it's over,
   * cuts it, retrying once if the cut is still over or much too short. Cuts are buffered,
   * so the reader never loses the original if they fail. Returns the text to keep.
   * The internal instructions are never saved.
   */
  private async enforceWordLimit(
    input: RunInput,
    request: Pick<ModelRequest, 'system' | 'messages'>,
    draft: string,
    send: SendEvent,
  ): Promise<string> {
    const limit = requestedWordLimit(input.message);
    if (!limit) return draft;
    const words = countDraftWords(draft);
    if (words <= limit) return draft;

    this.assertStillEnabled(input.user);
    const id = 'word-limit';
    send({ type: 'tool_start', id, name: 'word_limit', label: `Cutting the draft to ${limit} words` });
    let messages: ChatMessage[] = [...request.messages, { role: 'user', content: wordLimitCorrection(words, limit) }];
    let withinLimit: { text: string; words: number } | undefined; // the longest attempt that fits
    let overLimit = { text: draft, words }; // the shortest text that doesn't

    for (let attempt = 0; attempt < MAX_WORD_LIMIT_ATTEMPTS; attempt++) {
      this.assertStillEnabled(input.user);
      let revised: string;
      try {
        const turn = await this.model.stream(
          { system: request.system, messages, tools: [], signal: input.signal }, // these rounds only rewrite text
          () => undefined,
        );
        revised = turn.text.trim();
      } catch (err) {
        if (input.signal.aborted) throw err;
        this.log.warn(`Word-limit cut failed: ${err instanceof AgentError ? err.kind : 'unexpected error'}`);
        break;
      }
      if (!revised) break;

      const revisedWords = countDraftWords(revised);
      if (revisedWords > limit) {
        if (revisedWords < overLimit.words) overLimit = { text: revised, words: revisedWords };
      } else {
        if (!withinLimit || revisedWords > withinLimit.words) withinLimit = { text: revised, words: revisedWords };
        if (!isTooShort(revisedWords, limit)) break;
      }
      messages = [
        ...messages,
        { role: 'user', content: wordLimitRetry(revisedWords, limit) },
      ];
    }

    if (withinLimit) {
      send({ type: 'tool_end', id, ok: true, note: `${words} → ${withinLimit.words} words` });
      return withinLimit.text;
    }
    // Still over, or the cut failed: keep the shortest text and say so rather than pass it off as within the limit.
    send({ type: 'tool_end', id, ok: false, note: `Still ${overLimit.words} words` });
    return `${overLimit.text}\n\n_(This draft is ${overLimit.words} words, over the ${limit}-word limit. Cut it before using it.)_`;
  }
}
