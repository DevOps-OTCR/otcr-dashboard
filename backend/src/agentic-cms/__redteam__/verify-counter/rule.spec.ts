import { countDraftWords } from '../../agent/word-limit';
const body = Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ');
const note = Array.from({ length: 41 }, (_, i) => `n${i}`).join(' ');
it('separators', () => {
  for (const sep of ['---', '***', '___', '- - -', '* * *']) {
    console.log(JSON.stringify(sep), countDraftWords(`${body}\n\n${sep}\n${note}`));
  }
});
