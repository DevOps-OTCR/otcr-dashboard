import { requestedWordLimit, countDraftWords } from '../../agent/word-limit';
describe('per-unit limits (skeptic)', () => {
  it.each([
    ['Build an 8-slide deck. Each slide under 50 words.'],
    ['3 slides, 60 words each'],
    ['300 words or fewer per section, 3 sections'],
    ['Write 5 bullets of 100 words per bullet'],
    ['Keep every paragraph under 80 words'],
  ])('%s', (m) => { console.log(m, '=>', requestedWordLimit(m)); });
  it('deck count', () => {
    const slide = (i: number) => `## Slide ${i}: Title\n` + Array(45).fill('word').join(' ');
    const deck = [1,2,3,4,5,6,7,8].map(slide).join('\n\n');
    console.log('deck words', countDraftWords(deck));
  });
});
