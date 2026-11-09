import { countDraftWords } from '../../agent/word-limit';
it('paren vs bracket', () => {
  const b = countDraftWords('Revenue grew [S1]. Margins fell [S2, I1].');
  const p = countDraftWords('Revenue grew (S1). Margins fell (S2, I1).');
  const w = countDraftWords('Price fell (€2.1B, 2025, S4).');
  console.log({ b, p, w });
  // 300-word body w/ 1 paren citation per 15 words
  const sent = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron (S1, I2).';
  const body = Array(20).fill(sent).join(' ');
  console.log({ dense: countDraftWords(body) });
});
