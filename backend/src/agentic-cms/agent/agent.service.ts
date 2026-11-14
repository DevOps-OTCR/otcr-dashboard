import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { assistantMessage, ChatMessage, MODEL_CLIENT, ModelClient, ModelRequest } from '../model/model-client';
import { SkillLibrary } from '../skills/skill-library';
import { ToolRegistry } from '../tools/tool-registry';
import type { ToolContext } from '../tools/tool.types';
import { AgentError, featureDisabled, userRateLimited } from './agent-errors';
import type { AgentSource } from './agent.events';
import type { AgentUser, RunInput, SendEvent } from './agent.types';
import { checkCitations } from './citations';
import { ConversationStore } from './conversation.store';
import { buildSystemPrompt } from './prompt';
import { claimIds, dataFlagCount, sourceIds } from './evidence-tags';
import { countDraftWords, isTooShort, requestedWordLimit, wordLimitCorrection, wordLimitRejected, wordLimitRetry } from './word-limit';

export const MAX_ROUNDS = 10;
export const DEFAULT_MAX_MESSAGES_PER_HOUR = 60;
const MAX_WORD_LIMIT_ATTEMPTS = 2; // the first cut plus one retry
const MIN_CUT_SHARE = 0.25; // a "cut" under a quarter of the limit has thrown the draft away

const URL_PATTERN = /\bhttps?:\/\/[^\s)\]>]+/gi;

/** Why a cut can't replace the draft, or undefined if it only shortened it. */
function cutProblem(draft: string, revised: string, revisedWords: number, limit: number): string | undefined {
  const draftSources = new Set(sourceIds(draft));
  const addedSources = sourceIds(revised).filter((id) => !draftSources.has(id));
  if (addedSources.length) return `it cites ${addedSources.map((id) => `[${id}]`).join(', ')}, which your draft did not cite`;
  const draftClaims = new Set(claimIds(draft));
  const addedClaims = claimIds(revised).filter((id) => !draftClaims.has(id));
  if (addedClaims.length) return `it adds claim IDs ${addedClaims.join(', ')} that your draft did not have`;
  if (dataFlagCount(revised) < dataFlagCount(draft)) return 'it drops a [DATA NEEDED] flag';
  const draftLinks = new Set(draft.match(URL_PATTERN) ?? []);
  if ((revised.match(URL_PATTERN) ?? []).some((url) => !draftLinks.has(url))) return 'it adds a link your draft did not have';
  if (revisedWords < Math.ceil(limit * MIN_CUT_SHARE)) return `it keeps only ${revisedWords} words of the draft`;
  return undefined;
}

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
    // A failed turn keeps its user message (below). Retrying that same message reuses it rather than saving it twice.
    const prior = history[history.length - 1];
    const retrying = prior?.role === 'user' && prior.content === input.message;
    const turnMessages: ChatMessage[] = retrying ? [] : [userMsg];
    const tools = await this.tools.available();
    const skills = tools.some((t) => t.name === 'load_skill') ? await this.skills.list() : [];
    // Skills already loaded in a prior turn are visible in the history; tell the model so it
    // doesn't waste a round calling load_skill again.
    const loadedSkills = new Set<string>();
    for (const msg of history) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.function.name === 'load_skill') {
            try { const a = JSON.parse(tc.function.arguments); if (a.name) loadedSkills.add(a.name); } catch { /* ignore */ }
          }
        }
      }
    }
    const system = buildSystemPrompt({
      user: input.user,
      projectId: input.projectId,
      sprintId: input.sprintId,
      deliverableId: input.deliverableId,
      today: new Date().toISOString().slice(0, 10),
      tools: tools.map((t) => t.name),
      skills,
      loadedSkills,
      // Older turns' search results may have dropped out of the history window; this keeps their [n] meaning visible.
      sources: await this.store.sources(convo.id),
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
    // Vision flow: after images are injected and the model writes its analysis (no tool call),
    // inject a follow-up user message so the model generates a complete, properly-typed
    // add_pptx_comments call rather than being force-called with toolChoice (which produces
    // empty/invalid args because the model already expressed its analysis as text).
    let pendingImageAnalysis = false;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        this.assertStillEnabled(input.user);
        let roundText = false;
        const shownBefore = shown;
        const messages = [...history, ...turnMessages];
        const turn = await this.model.stream(
          { system, messages, tools: schemas, signal: input.signal },
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
          if (pendingImageAnalysis) {
            // Model wrote its visual analysis as text without calling the tool.
            // Inject a user message so the model generates a complete, schema-valid
            // add_pptx_comments call rather than producing empty args under toolChoice.
            pendingImageAnalysis = false;
            turnMessages.push({
              role: 'user',
              content:
                'Your analysis is complete. Now call add_pptx_comments with the full findings list — ' +
                'BLOCKING, MATERIAL, and MINOR — covering argument structure, evidence/source lines, ' +
                'exhibit selection, and any layout issues visible in the images. ' +
                'Use the exact slideIndex values from the fetch_pptx_content results.',
            });
            continue;
          }
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
          if (call.name === 'add_pptx_comments') pendingImageAnalysis = false;
          const before = sources.length;
          const result = await this.tools.execute(call, tools, ctx, send);
          turnMessages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
          // Vision tools return images; inject them as a user message with per-slide analysis
          // instructions so the model checks every dimension of the consulting-slides framework.
          if (result.images?.length) {
            turnMessages.push({
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    'Slide images for visual review. Work through each slide systematically: ' +
                    '(1) action title — is it a full-sentence claim, not a topic label? ' +
                    '(2) exhibit — right chart type for the message? axes labelled, units stated? ' +
                    '(3) evidence — source line present for every exhibit? ' +
                    '(4) layout — density within limits, no overflow? ' +
                    'Note every BLOCKING, MATERIAL, and MINOR issue. ' +
                    'Even high-quality decks typically have multiple MATERIAL findings.',
                },
                ...result.images,
              ],
            });
            pendingImageAnalysis = true;
          }
          if (sources.length !== before) send({ type: 'sources', sources: [...sources] });
        }
      }
    } catch (err) {
      // Keep the user's message so the conversation isn't lost; drop the half-finished turn.
      if (!retrying) await this.store.append(convo.id, [userMsg]).catch(() => undefined);
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
      const problem = cutProblem(draft, revised, revisedWords, limit);
      if (problem) {
        // A cut may only shorten the draft. One that changes its evidence is never shown or saved.
        this.log.warn(`Word-limit cut rejected: ${problem}`);
        messages = [
          ...messages,
          { role: 'assistant', content: revised },
          { role: 'user', content: wordLimitRejected(problem, limit) },
        ];
        continue;
      }
      if (revisedWords > limit) {
        if (revisedWords < overLimit.words) overLimit = { text: revised, words: revisedWords };
      } else {
        if (!withinLimit || revisedWords > withinLimit.words) withinLimit = { text: revised, words: revisedWords };
        if (!isTooShort(revisedWords, limit)) break;
      }
      messages = [
        ...messages,
        { role: 'assistant', content: revised },
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
