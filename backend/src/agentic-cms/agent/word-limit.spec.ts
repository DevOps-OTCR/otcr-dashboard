import { countDraftWords, extractDraft, isTooShort, requestedWordLimit, wordLimitCorrection, wordLimitRetry } from './word-limit';

describe('requestedWordLimit', () => {
  it.each([
    ['Write a 350-word executive summary', 350],
    ['Write a 1,500-word paper', 1500],
    ['Revise this to 250 words', 250],
    ['Keep it under 300 words please', 300],
    ['Draft a memo, word limit of 600', 600],
    ['word-limit: 400', 400],
    ['Write a 50-word blurb', 50],
    ['word cap 300', 300],
    ['word count: 400', 400],
    ['the max word count is 600', 600],
    ['the word count must stay under 400', 400],
    ['limit: 400 words', 400],
    ['400 words or less', 400],
    ['10,000 words', 10000],
    ['1.5k words', 1500],
    ['３００ words', 300],
    ['300words', 300],
    // Caps written with negated floor words (report H1).
    ['no more than 400 words', 400],
    ['not more than 400 words', 400],
    ['Keep it to no more than 400 words', 400],
    ['must not go over 400 words', 400],
    ['not above 400 words', 400],
    ['cannot exceed 400 words', 400],
    ['at most 400 words', 400],
    ['up to 400 words', 400],
    // A floor and a cap together: the cap applies.
    ['at least 500 and at most 800 words', 800],
    ['minimum of 500 words, maximum 800 words', 800],
    // Ranges: the upper bound is the cap, when a cut can't fall below the lower bound.
    ['Write a summary of 200-350 words', 350],
    ['a 250–400 word summary', 400],
    ['Write between 200 and 300 words', 300],
    // "over" used as time, not as a floor.
    ['over the next week, 400 words', 400],
    // Isaiah case 2: section budgets that add up to the total.
    ['1,500 words: intro 200 words, analysis 900 words, recommendation 400 words', 1500],
    ['1,500 words total, with a 300-word intro', 1500],
    // Isaiah case 3: a revision that names the old length.
    ['Cut the 486-word summary to 350 words', 350],
    ['Revise to 300 words. Original prompt was 500 words.', 300],
    // Source lengths never become, or cancel, the limit (report M).
    ['Summarise the 2,000-word report below in 300 words', 300],
    ['Write a 400-word memo. The source is a 3,000-word transcript.', 400],
    ['the email is 120 words; write a 300-word reply', 300],
    ['Quote: "He said 900 words is too long." Draft a 400-word op-ed.', 400],
    ['From “a 900-word brief” to a 400-word op-ed', 400],
    ['Use the 2,000-word article below. Write 300 words.', 300],
    // Revision instructions: "<verb> [this/my/the…] <source length> … into/to/down to/as <target>".
    ['Turn my 900-word notes into a 300-word summary', 300],
    ['Convert this 1,200-word draft into 400 words', 400],
    ['Get this 900-word draft down to 300 words', 300],
    ['Take the 800-word section and cut it to 400 words', 400],
    ['Shrink 900 words to 300 words', 300],
    ['Boil my 2,000-word report down to a 500-word brief', 500],
    ['Reduce from 1,200 to 800 words', 800],
    ['Please condense my 1,500-word report into a 600-word memo', 600],
    ['Can you shrink the 700-word intro down to 350 words?', 350],
    ['Edit my 500-word bio to fit 150 words', 150],
    ['Bring the 1,000-word draft down to 700 words', 700],
    ['Rewrite the 1,200-word section as a 400-word overview', 400],
    ['Revise our 2,500-word whitepaper into a 1,000-word brief', 1000],
    ['Make the 900-word article into a 300-word post', 300],
    ['Turn my 300-word notes into a 900-word whitepaper', 900],
    ['Summarize the 900-word article for a 300-word newsletter slot', 300],
    // Controls: a noun after the count without "each/per" is still one draft.
    ['Write a 300-word post for the CEO', 300],
    ['Write a 300-word executive summary for every reader to skim', 300],
    // "per the/our…" means "according to", not a per-part budget.
    ["Write a 500-word memo per the client's request", 500],
    // A per-part budget for one piece leaves the whole-draft length as the cap.
    ['Write a 1,500-word paper with a 300-word summary for each section', 1500],
    ['Write a 500-word memo and a 100-word note for each partner', 500],
    // Controls: a target after "it" is still a target.
    ['Make it 250 words', 250],
    ['Shrink it to 300 words', 300],
  ])('finds the limit in %s', (message, limit) => {
    expect(requestedWordLimit(message)).toBe(limit);
  });

  it.each([
    ['Summarize the market'],
    ['Give me a 3 word slogan'],
    ['A 350-word summary and a 1,500-word paper'],
    ['exec summary 300 words, body 1,200 words'],
    // Floors, before or after the number (report H1, M).
    ['At least 500 words on e-bikes'],
    ['A minimum of 800 words'],
    ['more than 500 words please, I need depth'],
    ['over 500 words'],
    ['above 500 words'],
    ['Not fewer than 500 words'],
    ['no fewer than 500 words'],
    ['500 words minimum'],
    ['500 word min'],
    ['500 words or more'],
    ['500+ words'],
    // Per-unit limits are not a limit on the whole draft (report H3).
    ['Each slide under 50 words'],
    ['3 slides, 60 words each'],
    ['300 words or fewer per section, 3 sections'],
    ['The deck has 10 slides; each under 50 words'],
    // Per-part budgets with any noun, not just slide/section/paragraph.
    ['300 words per topic'],
    ['Write 300 words on each of 3 topics'],
    ['Write 100 words about each competitor'],
    ['per competitor, 100 words'],
    // Negated "under"/"shorter than" is a minimum.
    ['not under 400 words'],
    ['not shorter than 400 words'],
    // A range whose lower bound is above the cut's too-short line (80% of 350 = 280).
    ['Write a summary of 300-350 words'],
    ['a 300–350 word summary'],
    // Two word counts that describe, compare or ask: never a revision target.
    ['Compare the 900-word version to the 300-word version'],
    ['My 900-word draft got cut to 300 words by the editor. What do you think?'],
    ['The 900-word paper was trimmed to 300 words last week; write a new intro'],
    ['Add a 300-word section to the 900-word paper'],
    ['Explain why going from 900 words to 300 words loses nuance'],
    ['Explain why going from 1,200 to 800 words loses nuance'],
    ['Last time you cut my 900-word draft to 300 words and lost the data'],
    ['Why did the 1,000-word report shrink to 400 words?'],
    ['Can you tell me if cutting 900 words to 300 words is too aggressive?'],
    ['Cutting a 900-word memo to 300 words is hard; give me tips'],
    ['Should I reduce my 900-word draft to 300 words or keep it?'],
    ['Get feedback on the 900-word draft before we cut it to 300 words'],
    ['Take a look at my 900-word draft and tell me if it fits into 300 words'],
    ['Make sure the 900-word draft maps to the 300-word abstract'],
    ['Turn off the 300-word limit for the 900-word paper'],
    ['Cut 900 words to 300 words and also add a 50-word abstract'],
    // Accepted misses: no direction word, or the verb is not where the sentence starts.
    ['From 900 words to 300 words, please'],
    ['Make my 600-word intro 250 words'],
    ['Get me 3 sources and turn the 900-word draft into 300 words'],
    ['Take 10 minutes to cut the 900-word draft to 300 words'],
    ['Cut the 900-word draft for the 300-word slot'],
    // Per-part budgets written after the noun.
    ['Write a 300-word post for each platform'],
    ['Write a 300-word summary per client'],
    ['Make the 900-word article into a 300-word post for each platform'],
    ['Turn my 900-word notes into a 300-word summary per client'],
    // The length of the text being worked on, as the only word count: not a limit.
    ['Translate the 1,500-word report into Spanish'],
    ['Proofread my 900-word essay'],
    ['Review the 900-word draft and fix the flow'],
    ['Rewrite this 600-word intro in a warmer tone'],
    ['Summarize this 2,000-word report'],
    ['Edit our 1,200-word whitepaper for clarity'],
    ['Expand this 300-word outline into a full paper'],
    ['Can you check my 800-word draft for errors?'],
    // An amount to remove, not a length to cut to.
    ['Cut 300 words from the draft'],
    ['Trim 100 words from my intro'],
    ['Shave 50 words off the conclusion'],
    ['Take out 200 words from the intro'],
    // A removed amount next to another word count: the other number may limit only part of the reply.
    ['Cut 1,000 words from the paper and add a 200-word summary'],
    ['Trim 300 words from the draft and write a 150-word cover note'],
    ['Remove 100 words from the intro and keep the whole thing at 400 words'],
    // "from" without a removal verb is not an amount to remove. Must never give 200 (a 1,000-word piece cut to 200).
    ["Write 1,000 words from the CFO's view, including a 200-word summary"],
    ['Write a 1,000-word report per our template, with a 200-word summary'],
    // Two different caps with nothing saying which is the total: no check rather than a wrong one.
    ['Write a 350-word summary and keep the appendix under 100 words'],
    ['Write the 350-word summary and a 100-word abstract'],
    // A minimum above the cut's too-short line: a cut could push the draft under it.
    ['make it longer, at least 1000 words, ideally 1200 words'],
    ['at least 750 and at most 800 words'],
    // "Words" that are not a length limit (report M).
    ['a 300 words-per-minute speaker script, 2 minutes'],
    ['Speak at 150 words per minute'],
    ['list 100 words to avoid in client decks'],
    // Only the source's length is mentioned.
    ['Summarise the 2,000-word report below'],
    ['Paste: "The board approved a 1,200-word charter." Write a memo.'],
    ['2 pages max'],
    ['under 1500 characters'],
    ['use 1,00 words'],
  ])('finds no single cap in %s', (message) => {
    expect(requestedWordLimit(message)).toBeUndefined();
  });

  it('treats the same limit stated twice as one limit', () => {
    expect(requestedWordLimit('A 350-word summary. Remember, 350 words maximum.')).toBe(350);
    expect(requestedWordLimit('Write 500 words. Do not exceed 500 words.')).toBe(500);
  });

  it('applies the minimum limit size at exactly 50', () => {
    expect(requestedWordLimit('in 49 words')).toBeUndefined();
    expect(requestedWordLimit('in 50 words')).toBe(50);
  });
});

describe('countDraftWords', () => {
  const words = (n: number, p = 'w') => Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ');

  it('counts plain words', () => {
    expect(countDraftWords('one two three')).toBe(3);
  });

  it('does not count the reviewer note below the last --- line', () => {
    expect(countDraftWords('one two\n---\nthree four\n---\nReviewer note goes here')).toBe(4);
  });

  it('does not count a markdown table divider as the reviewer-note line', () => {
    expect(countDraftWords('a b\n| x | y |\n|---|---|\n| z | w |')).toBe(6);
  });

  it('excludes headings', () => {
    expect(countDraftWords('# A big title\n\n## Section\nbody words')).toBe(2);
  });

  it('does not count citations, claim IDs or estimate labels, but counts data flags', () => {
    expect(countDraftWords('Sales grew [1] fast [S3, I2] overall [ESTIMATE: S3] here [DATA NEEDED: revenue]')).toBe(8);
  });

  it('ignores markdown bullets and stray symbols', () => {
    expect(countDraftWords('- one\n* two\n— three')).toBe(3);
  });

  it('ignores numbered-list markers but still counts numbers in prose', () => {
    expect(countDraftWords('1. four five\n2) six\nGrowth in 2020. was 12.')).toBe(8);
  });

  // Report H2: a --- line hid everything below it.
  it('counts a section after a mid-document --- break when no reviewer note follows', () => {
    expect(countDraftWords(`## A\n${words(100)}\n\n---\n\n## B\n${words(300)}`)).toBe(400);
    expect(countDraftWords(`${words(300, 'a')}\n\n---\n\n${words(186, 'b')}`)).toBe(486);
  });

  it('still drops a reviewer note after a mid-document break', () => {
    expect(countDraftWords(`${words(300, 'a')}\n\n---\n\n${words(300, 'b')}\n\n---\nWord count (estimate): 590 / 600`)).toBe(600);
  });

  it('drops a short reviewer note after *** or ___', () => {
    expect(countDraftWords(`${words(300)}\n\n***\nnote ${words(40, 'n')}`)).toBe(300);
    expect(countDraftWords(`${words(300)}\n\n___\nnote ${words(40, 'n')}`)).toBe(300);
  });

  it('ignores YAML front matter', () => {
    expect(countDraftWords(`---\ntitle: Paper\nauthor: OTCR\n---\n${words(600)}`)).toBe(600);
  });

  it('does not let a --- under a heading hide the body below it', () => {
    // Read as a break, not a heading: the 2 heading words count, the 500 below are not lost.
    expect(countDraftWords(`Section Heading\n---\n${words(500)}`)).toBe(502);
    expect(countDraftWords('Title Words Here\n================\nbody')).toBe(1);
  });

  it('never drops a paragraph written straight above the reviewer-note line', () => {
    expect(countDraftWords(`${words(400)}\n---\nWord count (estimate): 340 / 350`)).toBe(400);
  });

  it('drops a long reviewer note that starts with a review label', () => {
    for (const label of ['Reviewer checklist:', '**Notes for the reviewer**', 'Self-check', 'Sources checked:']) {
      expect(countDraftWords(`${words(300)}\n\n---\n${label} ${words(100, 'n')}`)).toBe(300);
    }
  });

  it('still counts a long closing section after a break', () => {
    expect(countDraftWords(`${words(300)}\n\n---\n\nIn conclusion ${words(100, 'c')}`)).toBe(402);
  });

  it('drops a reviewer note after a spaced rule', () => {
    expect(countDraftWords(`${words(300)}\n\n- - -\nnote ${words(40, 'n')}`)).toBe(300);
  });

  it('ignores a --- inside a code fence', () => {
    expect(countDraftWords(`${words(400)}\n\`\`\`yaml\n---\nk: v\n\`\`\`\n${words(5, 'z')}`)).toBe(407);
  });

  // Report M/L: tag forms the skills use, and prose inside an estimate label.
  it('does not count grouped, ranged or parenthesised citation and claim tags', () => {
    for (const tag of ['[1][2]', '[1-3]', '[1, 2–4]', '[S1; I2]', '(S1, I2)', '[S3a]', '[ESTIMATE S3]', '[ESTIMATE: S3, S4]']) {
      expect(countDraftWords(`claim ${tag} here`)).toBe(2);
    }
  });

  it('counts prose written inside an estimate label', () => {
    expect(countDraftWords('Market [ESTIMATE: roughly a third of riders] grows')).toBe(7);
  });

  it('counts an unclosed estimate label quickly (no catastrophic backtracking)', () => {
    const start = Date.now();
    countDraftWords(`[ESTIMATE: ${'a '.repeat(20_000)}`);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('extractDraft', () => {
  it('returns only the text between the markers, trimmed', () => {
    expect(extractDraft('Sure, trimming now.\n<draft>\nThe draft.\n\n---\nReviewer note.\n</draft>\nDone!')).toBe('The draft.\n\n---\nReviewer note.');
  });

  it('uses the last pair when the commentary mentions the markers, and ignores case', () => {
    expect(extractDraft('I will use <draft>x</draft> as asked.\n<DRAFT>\nReal draft\n</Draft>')).toBe('Real draft');
  });

  it('returns undefined without a complete pair, and empty text for an empty pair', () => {
    expect(extractDraft('Just the draft, no markers.')).toBeUndefined();
    expect(extractDraft('<draft>\nunclosed draft')).toBeUndefined();
    expect(extractDraft('<draft>\n  \n</draft>')).toBe('');
  });
});

describe('wordLimitCorrection', () => {
  it('states the real count and aims close to the limit', () => {
    const text = wordLimitCorrection(486, 350);
    expect(text).toContain('486 words');
    expect(text).toContain('hard 350 words');
    expect(text).toContain('about 332 words, never more than 350');
  });
});

describe('wordLimitRetry', () => {
  it('asks for a further cut when still over', () => {
    expect(wordLimitRetry(400, 350)).toMatch(/still has 400 words.*Cut it further/);
  });

  it('treats a rewrite at exactly the limit as too short, not still over', () => {
    expect(wordLimitRetry(350, 350)).toMatch(/only 350/);
  });

  it('asks to restore original content, without new facts, when too short', () => {
    const text = wordLimitRetry(200, 350);
    expect(text).toMatch(/only 200 words.*Restore the most useful content from your original draft/);
    expect(text).toContain('Do not add facts');
  });
});

describe('isTooShort', () => {
  it('treats anything under 80% of the limit as too short', () => {
    expect(isTooShort(279, 350)).toBe(true);
    expect(isTooShort(280, 350)).toBe(false);
    expect(isTooShort(350, 350)).toBe(false);
  });

  it('rounds 80% of the limit up', () => {
    expect(isTooShort(266, 333)).toBe(true);
    expect(isTooShort(267, 333)).toBe(false);
  });
});
