import { requestedWordLimit } from '../../agent/word-limit';
it('s8', () => {
  const out = [
    'Summarize this 2,000-word report in 300 words.',
    'Summarize the attached 5,000 word filing into a 350-word brief',
    'Summarize this report in 300 words.',
    'Turn the 1500-word article into a 250-word summary',
  ].map((m) => [m, requestedWordLimit(m)]);
  console.log(JSON.stringify(out));
});
