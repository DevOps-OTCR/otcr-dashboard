import { requestedWordLimit } from '../../agent/word-limit';
describe('s2', () => {
  it('limits', () => {
    const msgs = [
      'Write a 1,500-word white paper: intro 200 words, analysis 900 words, recommendation 400 words.',
      'Draft the Lumen paper, 1,500 words total, with a 300-word intro.',
      'Write a 1,500-word white paper.',
      'Write a 1,500-word white paper with an intro of about 200 words.',
    ];
    for (const m of msgs) console.log(JSON.stringify(m), '=>', requestedWordLimit(m));
  });
});
