import { requestedWordLimit as r, countDraftWords as c } from '../../agent/word-limit';
it('probe', () => {
  for (const m of ['no more than 400 words','Each slide under 50 words','1,500 words: intro 200 words, analysis 900 words, recommendation 400 words','500 words minimum','Cut the 486-word summary to 350 words']) console.log(JSON.stringify(m), '=>', r(m));
  console.log('mid --- count:', c(`## A\n${'x '.repeat(100)}\n\n---\n\n## B\n${Array(300).fill('w').join(' ')}`), '(human 400)');
});
