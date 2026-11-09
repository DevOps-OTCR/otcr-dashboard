import { requestedWordLimit } from '../../agent/word-limit';
it('probe', () => {
  const ps = ['Write a 1,500-word whitepaper; the executive summary must be under 300 words.',
  'Draft a 2,000-word report with a 250-word executive summary and 400 words per finding section.',
  'Revise this 600-word draft to a strict cap of 300 words.',
  'The LC said the original was 480 words. Cut it to under 350 words.',
  'Cut this to 300 words.', 'Write a 350-word executive summary'];
  console.log(ps.map(p => `${requestedWordLimit(p)} <= ${p}`).join('\n'));
});
