import { wordLimitCorrection, wordLimitRetry, isTooShort } from '../../agent/word-limit';
it('target text', () => {
  const c = wordLimitCorrection(120, 100); const r = wordLimitRetry(110, 100);
  console.log(c, '\n', r, '\n', isTooShort(79,100), isTooShort(80,100));
  expect(c).toContain('about 95 words');
});
