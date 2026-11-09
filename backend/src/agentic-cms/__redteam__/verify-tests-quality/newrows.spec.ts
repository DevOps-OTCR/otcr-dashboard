import * as orig from './orig'; import * as m09 from './m09'; import * as m10 from './m10'; import * as m18 from './m18'; import * as m14 from './m14';
const rows: [string, number|undefined][] = [['Write a 50-word blurb',50],['Keep it to 49 words',undefined],['word cap 300',300],['word max: 250',250]];
describe('new rows', () => {
  for (const [name, mod] of Object.entries({orig,m09,m10,m18})) it(name, () => { for (const [m,e] of rows) expect([m,(mod as any).requestedWordLimit(m)]).toEqual([m,e]); });
  it('m14 retry at exactly limit', () => { expect(orig.wordLimitRetry(350,350)).toMatch(/only 350/); expect(m14.wordLimitRetry(350,350)).toMatch(/only 350/); });
});
