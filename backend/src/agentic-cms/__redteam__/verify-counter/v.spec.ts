import { countDraftWords } from '../../agent/word-limit';
const w = (n: number, p = 'w') => Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ');
it('mid-document rule', () => {
  const t = `${w(200,'a')}\n\n---\n\n${w(500,'b')}`;
  console.log('A', countDraftWords(t));
  const t2 = `# Title\n\n## Section 1\n${w(200,'a')}\n\n---\n\n## Section 2\n${w(300,'b')}\n\n---\nWord count (estimate): 480 / 500`;
  console.log('B sectioned+note', countDraftWords(t2));
});
