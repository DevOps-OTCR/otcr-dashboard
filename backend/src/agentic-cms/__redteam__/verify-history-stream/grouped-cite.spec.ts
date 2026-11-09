import { checkCitations } from '../../agent/citations';
import { countDraftWords } from '../../agent/word-limit';
const s = (id: number) => ({ id, title: 't' + id, url: 'https://x/' + id }) as any;
it('grouped', () => {
  const r = checkCitations('Claim [1, 2].', [s(1), s(2)]);
  console.log(JSON.stringify(r), countDraftWords('Claim [1, 2].'));
  expect(r.cited).toEqual([]);
});
