import { requestedWordLimit } from '../../agent/word-limit';
const cases: [string, number][] = [
 ['word count: 400', 400], ['the max word count is 600', 600], ['the word count must stay under 400', 400],
 ['1.5k words', 1500], ['five hundred words', 500], ['３００ words', 300], ['٥٠٠ words', 500],
 ['Write a summary, word count under 400', 400], ['keep it under 400 words', 400], ['400 word max', 400],
];
it('probe', () => { for (const [m, e] of cases) console.log(JSON.stringify(m), '=>', requestedWordLimit(m), 'expected', e); });
