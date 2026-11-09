import { requestedWordLimit } from '../../agent/word-limit';
it('negated floor wording', () => {
  const msgs = ['No more than 300 words.', 'Not more than 300 words please', "Don't go over 300 words.", 'Nothing over 300 words', 'Keep it under 300 words', 'At least 300 words', 'More than 300 words'];
  console.log(JSON.stringify(msgs.map((m) => [m, requestedWordLimit(m)])));
});
