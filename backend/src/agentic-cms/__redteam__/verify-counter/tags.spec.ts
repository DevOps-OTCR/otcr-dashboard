import { countDraftWords } from '../../agent/word-limit';
const cases = ['[1]','[S3, I2]','[ESTIMATE: S3]','[1-3]','[1, 2–4]','[S1; I2]','[ESTIMATE S3]','[S3a]','[ESTIMATE]','[ASSUMPTION: I2 — unvalidated]','[UNVERIFIED: open and check]','[ILLUSTRATIVE]'];
it('tags', () => {
  const out = cases.map(c => `${c} => ${countDraftWords(`claim ${c} here`)}`);
  out.push('list => ' + countDraftWords('1. alpha beta\n2. gamma delta\n3. eps'));
  console.log(out.join('\n'));
});
