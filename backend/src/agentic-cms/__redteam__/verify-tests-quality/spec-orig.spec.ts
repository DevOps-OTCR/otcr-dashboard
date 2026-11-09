import { countDraftWords, isTooShort, requestedWordLimit, wordLimitCorrection, wordLimitRetry } from './orig';

describe('requestedWordLimit', () => {
  it.each([
    ['Write a 350-word executive summary', 350],
    ['Write a 1,500-word paper', 1500],
    ['Revise this to 250 words', 250],
    ['Keep it under 300 words please', 300],
    ['Draft a memo, word limit of 600', 600],
    ['word-limit: 400', 400],
  ])('finds the limit in %s', (message, limit) => {
    expect(requestedWordLimit(message)).toBe(limit);
  });

  it.each([
    ['Summarize the market'],
    ['At least 500 words on e-bikes'],
    ['A minimum of 800 words'],
    ['Give me a 3 word slogan'],
    ['A 350-word summary and a 1,500-word paper'],
  ])('finds no single cap in %s', (message) => {
    expect(requestedWordLimit(message)).toBeUndefined();
  });

  it('treats the same limit stated twice as one limit', () => {
    expect(requestedWordLimit('A 350-word summary. Remember, 350 words maximum.')).toBe(350);
  });
});

describe('countDraftWords', () => {
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
});
