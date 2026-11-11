// Backend check for word limits. Prompt wording alone doesn't hold them: in Group 3's
// runs on Lumen a 350-word summary came out at 486, and the model's own counts ran 10-35% low.
//
// A missed limit leaves the draft as the model wrote it; a wrong limit makes the server cut
// good text. So the parser only returns a limit it is sure of, and undefined otherwise.

import { stripEvidenceTags } from './evidence-tags';

const MIN_LIMIT = 50; // below this, "N words" is rarely a length limit on a draft
const NUMBER = String.raw`\d+(?:\.\d+)?k\b|\d{1,3}(?:,\d{3})+|\d+`;
const UNITS = String.raw`slides?|sections?|paragraphs?|bullets?|bullet points?|pages?|points?|cards?|questions?|answers?|items?|chapters?|parts?|responses?|posts?|tweets?|captions?|headlines?`;

/** Text before the number, back to the start of its sentence. */
const BEFORE_FLOOR = /(?:at least|minimum(?: of)?|min\.?|no (?:fewer|less) than|not (?:fewer|less) than|more than|over|above|upwards of)\s+$/i;
const NEGATED_CAP = /(?:\bno|\bnot|\bnever|n't|\bcannot)\s+(?:\w+\s+){0,2}?(?:more than|over|above|beyond|past|exceed(?:ing)?)\s+$/i;
const PER_UNIT_BEFORE = new RegExp(String.raw`\b(?:each|every|per)\s+(?:of the\s+)?(?:${UNITS})\b`, 'i');
const PER_EACH_BEFORE = /\b(?:each|every)\s+(?:(?:one|of them|under|below|at most|max(?:imum)?|no more than|up to|within)\s+)*$/i;
const LIST_BEFORE = /\b(?:list|name|suggest|brainstorm|find)\s+(?:me\s+)?(?:the\s+)?$/i;
const DESCRIBES_BEFORE = /\b(?:is|was|are|were|has|had|runs?|ran|currently|already)\s+(?:(?:a|an|about|around|roughly|nearly|over|under|just|only)\s+)*$/i;
const TRANSFORM_THE = /\b(?:summari[sz]e|cut|trim|shorten|condense|edit|revise|rewrite|tighten|reduce|review|proofread|translate|paraphrase)\s+(?:the|this|that|my|our|your|his|her|their|its)\s+$/i;
/** "total" next to its own number: "a total of 1,500 words", "1,500 words total", "1,500 words overall". */
const TOTAL_BEFORE = /\b(?:total|overall|in all|altogether|combined|whole|entire)\b(?:\s+(?:of|is|limit|length|cap|draft|paper|deck))*\s*:?\s*(?:about\s+|around\s+)?$/i;
const TOTAL_AFTER = /^\s*(?:in )?(?:total|overall|in all|altogether|combined)\b/i;

/** Text after "words", up to the end of its sentence. */
const AFTER_FLOOR = /^\s*(?:minimum|min\b|or (?:more|longer|above)|at (?:the )?least)/i;
const AFTER_RATE = /^[\s-]*(?:per|a|an|every)[\s-]+(?:minute|min|second|sec|hour)\b/i;
const AFTER_PER_UNIT = new RegExp(
  String.raw`^\s*(?:or (?:fewer|less)\s+)?(?:each|apiece|(?:per|for each|in each|on each|in every|a)\s+(?:${UNITS})\b)`,
  'i',
);
const AFTER_SOURCE = /^\s*(?:[\w-]+\s+){0,2}?(?:below|above|attached|pasted|here|I sent|you sent|from earlier)\b/i;

type Candidate = { value: number; start: number; end: number; plus: boolean; phrase: boolean };
/** cap: limits the whole draft. floor: a minimum. ignore: per-unit, a rate, a list, or the source's length. */
type Kind = 'cap' | 'floor' | 'ignore';

const parseNumber = (raw: string) =>
  /k$/i.test(raw) ? Math.round(Number(raw.slice(0, -1)) * 1000) : Number(raw.replace(/,/g, ''));

/** The part of `text` before `index` that belongs to the same sentence. */
function sentenceBefore(text: string, index: number) {
  const window = text.slice(Math.max(0, index - 80), index);
  return window.slice(Math.max(...['.', '!', '?', ';', '\n'].map((c) => window.lastIndexOf(c))) + 1);
}

function sentenceAfter(text: string, index: number) {
  const window = text.slice(index, index + 50);
  const cut = window.search(/[.!?;\n]/);
  return cut < 0 ? window : window.slice(0, cut);
}

function insideQuotes(text: string, index: number) {
  const before = text.slice(0, index);
  const straight = (before.match(/"/g) ?? []).length;
  const open = (before.match(/[“]/g) ?? []).length - (before.match(/[”]/g) ?? []).length;
  return straight % 2 === 1 || open > 0;
}

function classify(message: string, c: Candidate): Kind {
  const before = sentenceBefore(message, c.start);
  const after = sentenceAfter(message, c.end);
  if (insideQuotes(message, c.start)) return 'ignore';
  if (c.phrase) return 'cap';
  if (AFTER_RATE.test(after) || LIST_BEFORE.test(before)) return 'ignore';
  if (PER_UNIT_BEFORE.test(before) || PER_EACH_BEFORE.test(before) || AFTER_PER_UNIT.test(after)) return 'ignore';
  if (DESCRIBES_BEFORE.test(before) || TRANSFORM_THE.test(before) || AFTER_SOURCE.test(after)) return 'ignore';
  if (NEGATED_CAP.test(before)) return 'cap';
  if (c.plus || BEFORE_FLOOR.test(before) || AFTER_FLOOR.test(after)) return 'floor';
  return 'cap';
}

const isTotal = (message: string, c: Candidate) =>
  TOTAL_BEFORE.test(sentenceBefore(message, c.start)) || TOTAL_AFTER.test(sentenceAfter(message, c.end));

function candidates(message: string): Candidate[] {
  const found: Candidate[] = [];
  const phraseNumbers = new Set<number>();
  // "word limit of 600", "word count: 400", "the max word count is 600": always a stated limit.
  for (const m of message.matchAll(new RegExp(String.raw`\bword[\s-]*(?:limit|cap|count|maximum|max)\b[^\d\n]{0,20}?(${NUMBER})`, 'gi'))) {
    const start = m.index + m[0].length - m[1].length;
    found.push({ value: parseNumber(m[1]), start, end: start + m[1].length, plus: false, phrase: true });
    phraseNumbers.add(start);
  }
  // "350-word", "350 words", "300-350 words", "between 200 and 300 words", "500+ words".
  // A range is one candidate with its upper bound, classified from where the range starts.
  const pattern = String.raw`((?<![\d,.])(?:${NUMBER})\s*(?:-|–|—|to|and)\s*)?(?<![\d,.])(${NUMBER})(\+)?[\s-]*words?\b`;
  for (const m of message.matchAll(new RegExp(pattern, 'gi'))) {
    if (phraseNumbers.has(m.index + (m[1]?.length ?? 0))) continue;
    found.push({ value: parseNumber(m[2]), start: m.index, end: m.index + m[0].length, plus: Boolean(m[3]), phrase: false });
  }
  return found;
}

/**
 * Finds the word limit for the whole draft stated in the user's message ("350-word summary",
 * "no more than 400 words", "1,500 words: intro 200, analysis 900, recommendation 400").
 * Floors, per-slide or per-section limits, rates and the length of pasted source material
 * are not limits on the draft. Returns undefined unless one limit clearly applies.
 */
export function requestedWordLimit(message: string): number | undefined {
  const text = message.normalize('NFKC'); // full-width digits
  const found = candidates(text);
  const caps = found.filter((c) => c.value >= MIN_LIMIT && classify(text, c) === 'cap');
  const limit = pickLimit(text, caps);
  if (limit === undefined) return undefined;
  // A cut may land as low as the too-short line. If the user's own minimum is above it, a check
  // could push a good draft under that minimum, so make none.
  const floors = [
    ...found.filter((c) => classify(text, c) === 'floor').map((c) => c.value),
    // "at least 750 and at most 800 words": the minimum's number has no "words" of its own.
    ...[...text.matchAll(new RegExp(String.raw`\b(?:at least|minimum(?: of)?|no (?:fewer|less) than)\s+(${NUMBER})`, 'gi'))].map((m) => parseNumber(m[1])),
  ];
  const floor = Math.max(0, ...floors);
  return isTooShort(floor, limit) ? limit : undefined;
}

function pickLimit(text: string, caps: Candidate[]): number | undefined {
  const values = [...new Set(caps.map((c) => c.value))];
  if (values.length <= 1) return values[0];

  // Several caps: use one only when the message says which is the whole-draft total.
  const totals = [...new Set(caps.filter((c) => isTotal(text, c)).map((c) => c.value))];
  if (totals.length === 1) return totals[0];

  // Section budgets that add up to the largest number: that number is the total.
  const largest = Math.max(...values);
  const rest = caps.filter((c) => c.value !== largest).reduce((sum, c) => sum + c.value, 0);
  if (Math.abs(rest - largest) <= largest * 0.02) return largest;
  return undefined;
}

const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,}|(?:[-*_]\s+){2,}[-*_])\s*$/;
const SETEXT_H1 = /^\s{0,3}={3,}\s*$/;
const ATX_HEADING = /^\s{0,3}#{1,6}\s/;
const NOTE_START = /^\s*(?:[*_]{1,2})?(?:word count|reviewer note|notes? (?:to|for) (?:the )?reviewer|self-check|qa note)/i;
const MAX_NOTE_WORDS = 80;

const countTokens = (text: string) =>
  stripEvidenceTags(text)
    .replace(/^\s*\d{1,3}[.)]\s+/gm, ' ') // "1. " list markers, only at the start of a line
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

/**
 * Counts the deliverable the way the skills define it: the reviewer note below the last
 * rule doesn't count, nor do headings, front matter, or citation and claim tags such as
 * [1], [S3, I2] and [ESTIMATE: S3]. A rule that only separates sections doesn't hide
 * what follows it: the tail is dropped only when it looks like a reviewer note.
 */
export function countDraftWords(text: string): number {
  let lines = text.split(/\r?\n/);

  // Front matter: a --- block at the very top holding "key: value" lines.
  if (/^---\s*$/.test(lines[0] ?? '')) {
    const close = lines.findIndex((line, i) => i > 0 && i <= 30 && /^---\s*$/.test(line));
    if (close > 0 && lines.slice(1, close).every((l) => !l.trim() || /^[\w-]+\s*:/.test(l))) lines = lines.slice(close + 1);
  }

  const kept: string[] = [];
  const rules: number[] = []; // indexes in `kept` where a thematic break was
  let inFence = false;
  for (const line of lines) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      kept.push(line);
      continue;
    }
    // "Title\n===" is a heading. "Title\n---" is treated as a break: a heading's few words may then
    // count, but a paragraph written straight above the reviewer-note line is never dropped.
    if (SETEXT_H1.test(line) && kept.length && kept[kept.length - 1].trim()) {
      kept.pop();
      continue;
    }
    if (RULE.test(line)) {
      rules.push(kept.length);
      kept.push('');
      continue;
    }
    kept.push(ATX_HEADING.test(line) ? '' : line);
  }

  const lastRule = rules[rules.length - 1];
  if (lastRule !== undefined) {
    const tail = kept.slice(lastRule + 1).join('\n');
    const firstLine = tail.split('\n').find((l) => l.trim()) ?? '';
    if (NOTE_START.test(firstLine) || countTokens(tail) <= MAX_NOTE_WORDS) return countTokens(kept.slice(0, lastRule).join('\n'));
  }
  return countTokens(kept.join('\n'));
}

const targetWords = (limit: number) => Math.floor(limit * 0.95);
const SAME_RULES =
  'The reviewer note below the --- line and headings do not count. Keep the recommendation, any stop condition and every [DATA NEEDED] flag. ' +
  'Keep every remaining citation number and claim ID exactly as written. Do not add facts, sources, links or numbers. Update any word-count line in the reviewer note. ' +
  'Reply with only the rewritten draft, plus its reviewer note if it had one.';

/** A cut below this share of the limit has lost more content than it needed to. */
export function isTooShort(words: number, limit: number): boolean {
  return words < Math.ceil(limit * 0.8);
}

/** The server-written instruction for the first automatic cut. */
export function wordLimitCorrection(words: number, limit: number): string {
  return (
    `The draft you just wrote has ${words} words in its body, counted by the server. The limit is a hard ${limit} words. ` +
    `Rewrite the whole draft with a body of about ${targetWords(limit)} words, never more than ${limit}. Trim only what you need to. ` +
    `Cut in this order: restated facts, worked arithmetic, secondary caveats. ${SAME_RULES}`
  );
}

/** The one retry, for a cut that came back over the limit or further under it than it needed to. */
export function wordLimitRetry(words: number, limit: number): string {
  const problem =
    words > limit
      ? `That rewrite still has ${words} words in its body, counted by the server, and the limit is a hard ${limit}. Cut it further.`
      : `That rewrite has only ${words} words in its body, counted by the server, so it cut too much. Restore the most useful content from your original draft.`;
  return `${problem} Aim for about ${targetWords(limit)} words, never more than ${limit}. ${SAME_RULES}`;
}

/** The retry for a cut that changed the evidence rather than only shortening the draft. */
export function wordLimitRejected(problem: string, limit: number): string {
  return `That rewrite can't be used: ${problem}. Rewrite your original draft again. Aim for about ${targetWords(limit)} words, never more than ${limit}. ${SAME_RULES}`;
}
