// The two evidence ID spaces, kept apart (Nov 8 integration contract):
// - [n]: UI source-link numbers, backed by the conversation's source registry.
// - S#/I#: claim IDs from a skill's evidence ledger. Never read as source numbers, never renumbered.
// The word counter, the citation check and the word-limit cut check all read tags through this file.

const NUM_ITEM = String.raw`\d+(?:\s*[-–]\s*\d+)?`;
const CLAIM_ID = String.raw`[SI]\d+[a-z]?`;
const LIST_SEP = String.raw`\s*[,;]\s*`;
const MAX_RANGE = 50; // [1-3] expands; an implausible [1-100000] keeps only its ends

/** [1], [1, 2], [1-3], [1; 4]: not followed by "(" so markdown links like [1](url) stay links. */
const SOURCE_TAG = new RegExp(String.raw`\[\s*(${NUM_ITEM}(?:${LIST_SEP}${NUM_ITEM})*)\s*\](?!\()`, 'g');
/** [S1], [S1; I2], (S1, I2), [S3a]. */
const CLAIM_TAG = new RegExp(String.raw`[\[(]\s*${CLAIM_ID}(?:${LIST_SEP}${CLAIM_ID})*\s*[\])]`, 'gi');
/** [ESTIMATE], [ESTIMATE S3], [ESTIMATE: about a third]. Bounded and newline-free, so an unclosed tag can't backtrack. */
const ESTIMATE_TAG = /\[ESTIMATE\b:?([^\]\n]{0,200})\]/gi;
const ID_LIST_ONLY = new RegExp(String.raw`^\s*(?:(?:${CLAIM_ID}|\d+)(?:${LIST_SEP}(?:${CLAIM_ID}|\d+))*)?\s*$`, 'i');
const DATA_FLAG = /\[DATA NEEDED\b/gi;

/** The [n] source numbers cited in the text, sorted and de-duplicated. */
export function sourceIds(text: string): number[] {
  const ids = new Set<number>();
  for (const match of text.matchAll(SOURCE_TAG)) {
    for (const item of match[1].split(/[,;]/)) {
      const [from, to] = item.split(/[-–]/).map((n) => Number(n.trim()));
      if (to === undefined) ids.add(from);
      else if (to >= from && to - from <= MAX_RANGE) for (let n = from; n <= to; n++) ids.add(n);
      else ids.add(from).add(to);
    }
  }
  return [...ids].sort((x, y) => x - y);
}

/** The S#/I# claim IDs written in tags (not "S3" in running prose), including estimate labels; sorted, de-duplicated. */
export function claimIds(text: string): string[] {
  const tags = [...text.matchAll(CLAIM_TAG), ...text.matchAll(ESTIMATE_TAG)].map((m) => m[0]);
  return [...new Set(tags.flatMap((tag) => tag.match(new RegExp(CLAIM_ID, 'g')) ?? []))].sort();
}

/** How many [DATA NEEDED] flags the text has. */
export function dataFlagCount(text: string): number {
  return [...text.matchAll(DATA_FLAG)].length;
}

/** Removes ID tags (they are not words) but keeps prose written inside an estimate label and every [DATA NEEDED] flag. */
export function stripEvidenceTags(text: string): string {
  return text
    .replace(ESTIMATE_TAG, (_m, inner: string) => (ID_LIST_ONLY.test(inner) ? ' ' : ` ${inner} `))
    .replace(CLAIM_TAG, ' ')
    .replace(SOURCE_TAG, ' ');
}
