import { requestedWordLimit } from '../../agent/word-limit';
it('probe', () => {
  const msgs = ['Revise the 350-word summary down to 250 words','Shorten it from 350 words to 250 words','Now cut it to 250.','Trim it down to 250 max','Now revise to 250 words.','Cut it from 350 to 250 words'];
  console.log(msgs.map(m => `${m} => ${requestedWordLimit(m)}`).join('\n'));
});
