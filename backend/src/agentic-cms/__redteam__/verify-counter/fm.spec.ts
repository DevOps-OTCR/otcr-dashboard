import { countDraftWords } from '../../agent/word-limit';
const body = (n:number)=>Array.from({length:n},(_,i)=>'w'+i).join(' ');
it('probe', () => {
  const a = countDraftWords('---\ntitle: Paper\nauthor: OTCR\n---\n' + body(600));
  const b = countDraftWords('Section Heading\n---\n' + body(500));
  const c = countDraftWords('Intro para here.\n\n---\n\n' + body(500) + '\n\n---\nReviewer note: check X.');
  console.log({a,b,c});
});
