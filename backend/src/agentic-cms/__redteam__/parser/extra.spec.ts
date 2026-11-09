import { requestedWordLimit } from '../../agent/word-limit';
it('extra', () => {
  const m = ['not more than 400 words', 'Keep it to no more than 400 words', 'must not go over 400 words', 'not above 400 words', 'up to 400 words', 'at most 400 words', 'cannot exceed 400 words', 'Word limit: 400 (hard)', 'the word count must stay under 400', 'Write 400 words', 'Write a 400-word memo. The source is a 3,000-word transcript.', '400 words', 'Use at least 3 sources. 400 words.', 'over the next week, 400 words'];
  console.log(m.map((x) => `${requestedWordLimit(x)} :: ${x}`).join('\n'));
});
