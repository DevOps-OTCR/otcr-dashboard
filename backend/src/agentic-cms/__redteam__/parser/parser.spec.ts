import { requestedWordLimit, countDraftWords } from '../../agent/word-limit';

const cases: [string, number | undefined][] = [
  ['Write a 300-350 words summary', undefined],
  ['Write a summary of 300-350 words', 350],
  ['Write between 200 and 300 words', 300],
  ['about 500 words on Lumen', 500],
  ['around 500 words', 500],
  ['roughly 500 words', 500],
  ['no more than 400 words', 400],
  ['under 250 words', 250],
  ['max 1,500 words', 1500],
  ['1.5k words', 1500],
  ['five hundred words', 500],
  ['~300 words', 300],
  ['Summarise the 2,000-word report below in 300 words', 300],
  ['Summarise the 2,000-word report below', undefined],
  ['Paste: "The board approved a 1,200-word charter." Write a memo.', undefined],
  ['exec summary 300 words, body 1,200 words', undefined],
  ['a 300 words-per-minute speaker script, 2 minutes', undefined],
  ['list 100 words to avoid in client decks', undefined],
  ['2 pages max', undefined],
  ['under 1500 characters', undefined],
  ['٥٠٠ words', 500],
  ['３００ words', 300],
  ['at least 500 words', undefined],
  ['make it 250 words', 250],
  ['500 word min', undefined],
  ['500 words minimum', undefined],
  ['500 words or more', undefined],
  ['500+ words', undefined],
  ['at least 500 and at most 800 words', 800],
  ['minimum of 500 words, maximum 800 words', 800],
  ['more than 500 words please, I need depth', undefined],
  ['Not fewer than 500 words', undefined],
  ['word count: 400', 400],
  ['limit: 400 words', 400],
  ['400 words or less', 400],
  ['keep it under 400 words', 400],
  ['300 word', 300],
  ['300words', 300],
  ['300 Words', 300],
  ['a 300–350 word summary', 350],
  ['in 40 words', undefined],
  ['word limit is 1,000', 1000],
  ['the max word count is 600', 600],
  ['Revise to 300 words. Original prompt was 500 words.', 300],
  ['expand to 800 words', undefined],
  ['make it longer, at least 1000 words, ideally 1200 words', undefined],
  ['Each slide under 50 words', undefined],
  ['3 slides, 60 words each', undefined],
  ['use 1,00 words', undefined],
  ['10,000 words', 10000],
  ['300 words or fewer per section, 3 sections', undefined],
  ['Quote: "He said 900 words is too long." Draft a 400-word op-ed.', 400],
  ['Write 500 words. Do not exceed 500 words.', 500],
  ['the email is 120 words; write a 300-word reply', 300],
];

describe('parser probe', () => {
  it('table', () => {
    const rows = cases.map(([m, exp]) => {
      const got = requestedWordLimit(m);
      return `${got === exp ? 'ok  ' : 'DIFF'} got=${got} want=${exp} :: ${m}`;
    });
    console.log(rows.join('\n'));
  });
  it('count', () => {
    console.log('count', countDraftWords('Hello — world 1,000 [1] [S1, I2] [ESTIMATE: S3] e.g. U.S.'));
  });
});
