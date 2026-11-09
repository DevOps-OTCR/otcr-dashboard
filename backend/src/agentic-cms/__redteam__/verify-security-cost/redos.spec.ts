import { countDraftWords } from '../../agent/word-limit';
describe('redos verify', () => {
  it('times', () => {
    for (const n of [4000, 8000, 20000, 40000]) {
      const s = '[ESTIMATE:'.repeat(n);
      const t = Date.now(); countDraftWords(s); const ms = Date.now() - t;
      // realistic: 16k-token output ~ 64k chars
      console.log(`chars=${s.length} ms=${ms}`);
    }
    const normal = 'word [1] '.repeat(20000);
    const t = Date.now(); countDraftWords(normal); console.log(`normal chars=${normal.length} ms=${Date.now()-t}`);
    // with newlines between tags
    const nl = '[ESTIMATE: x\n'.repeat(8000);
    const t2 = Date.now(); countDraftWords(nl); console.log(`nl chars=${nl.length} ms=${Date.now()-t2}`);
  });
});
