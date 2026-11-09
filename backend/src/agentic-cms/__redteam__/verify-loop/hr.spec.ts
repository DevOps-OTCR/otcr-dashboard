import { countDraftWords } from '../../agent/word-limit';
const w = (n: number, p = 'alpha') => Array.from({ length: n }, () => p).join(' ');
it('--- dividers hide body words', () => {
  const draft = `${w(45)}\n\n---\n\n${w(45)}\n\n---\n\n${w(45)}`;
  const c = countDraftWords(draft);
  console.log('sectioned counted', c);
  expect(c).toBe(90);
  const cut = `${w(90)}\n\n---\n\n${w(200)}`;
  console.log('fake-note counted', countDraftWords(cut));
  // markdown alternatives
  console.log('*** counted', countDraftWords(`${w(45)}\n\n***\n\n${w(45)}`));
});
