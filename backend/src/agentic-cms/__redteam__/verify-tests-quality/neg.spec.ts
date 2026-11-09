import { requestedWordLimit } from '../../agent/word-limit';
const cases = ['Keep it to no more than 300 words','Make sure it is not over 300 words','Nothing above 300 words please','Write a summary, no more than 300 words.','not more than 300 words','no longer than 300 words','under 300 words','Write more than 300 words','max 300 words','300 words max'];
it('probe', () => { for (const c of cases) console.log(JSON.stringify(c), '=>', requestedWordLimit(c)); });
