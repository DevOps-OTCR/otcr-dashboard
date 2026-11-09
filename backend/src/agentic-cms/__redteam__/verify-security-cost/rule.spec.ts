import { countDraftWords } from '../../agent/word-limit';
const w = (n: number, p = 'word') => Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ');
it('tail after last rule ignored', () => {
  expect(countDraftWords(`${w(200)}\n\n---\n\n${w(400)}`)).toBe(200);
});
it('sectioned paper with --- separators, no reviewer note: last section uncounted', () => {
  const doc = `## A\n${w(150)}\n\n---\n\n## B\n${w(150)}\n\n---\n\n## C\n${w(150)}`;
  expect(countDraftWords(doc)).toBe(300);
});
