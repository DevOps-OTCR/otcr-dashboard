// Backend check for word limits. Prompt wording alone doesn't hold them: in Group 3's
// runs on Lumen a 350-word summary came out at 486, and the model's own counts ran 10-35% low.

const MIN_LIMIT = 50; // below this, "N words" is rarely a length limit on a draft
const NUMBER = String.raw`\d{1,3}(?:,\d{3})+|\d+`;
const FLOOR_WORDING = /(?:at least|minimum(?: of)?|min\.?|no (?:fewer|less) than|more than|over|above)\s+$/i;

/**
 * Finds the word limit stated in the user's message ("350-word summary", "under 250 words",
 * "word limit of 500"). Returns undefined unless exactly one distinct limit is stated:
 * with several we can't tell which one applies to this draft.
 */
export function requestedWordLimit(message: string): number | undefined {
  const limits = new Set<number>();
  const add = (raw: string) => {
    const value = Number(raw.replace(/,/g, ''));
    if (value >= MIN_LIMIT) limits.add(value);
  };
  for (const match of message.matchAll(new RegExp(String.raw`(?<![\d,.])(${NUMBER})[\s-]*words?\b`, 'gi'))) {
    const before = message.slice(Math.max(0, match.index - 5), match.index);
    if (!FLOOR_WORDING.test(before)) add(match[1]);
  }
  for (const match of message.matchAll(new RegExp(String.raw`\bword[\s-]*(?:limit|cap|maximum|max)\b[^\d\n]{0,12}(${NUMBER})`, 'gi'))) {
    add(match[1]);
  }
  return limits.size === 1 ? [...limits][0] : undefined;
}

/**
 * Counts the deliverable the way the skills define it: everything above the last `---`
 * line (the reviewer note doesn't count), headings excluded, and citation or claim
 * tags such as [1], [S3, I2] and [ESTIMATE: S3] not counted as words.
 */
export function countDraftWords(text: string): number {
  const lines = text.split(/\r?\n/);
  const lastRule = lines.reduce((last, line, i) => (/^\s*-{3,}\s*$/.test(line) ? i : last), -1);
  return (lastRule >= 0 ? lines.slice(0, lastRule) : lines)
    .filter((line) => !/^\s{0,3}#{1,6}\s/.test(line))
    .join('\n')
    .replace(/\[(?:ESTIMATE:[^\]]*|\s*(?:\d+|[SI]\d+)(?:\s*,\s*(?:\d+|[SI]\d+))*\s*)\]/gi, ' ')
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

const targetWords = (limit: number) => Math.floor(limit * 0.95);
const SAME_RULES =
  'The reviewer note below the --- line and headings do not count. Keep the recommendation, any stop condition and every [DATA NEEDED] flag. ' +
  'Keep every remaining citation number and claim ID exactly as written. Do not add facts, sources or numbers. Update any word-count line in the reviewer note. ' +
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
