import { countDraftWords, requestedWordLimit } from '../../agent/word-limit';
const w = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
it('probe', () => {
  console.log('limit', requestedWordLimit('Write a 300-word summary'));
  console.log('S7', countDraftWords(`${w(200)}\n\n---\n\n${w(200)}`));
  console.log('S7b', countDraftWords(`Lumen Executive Summary\n---\n${w(480)}`));
  console.log('withNote', countDraftWords(`${w(200)}\n\n---\n\n${w(200)}\n\n---\nWord count (estimate): 380 / 300`));
});
