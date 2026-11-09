import { isTooShort as orig } from '../../agent/word-limit';
import { isTooShort as mut } from './mutant';
describe('boundary', () => {
  it.each([[orig],[mut]])('original spec assertions', (f) => {
    expect(f(279,350)).toBe(true); expect(f(280,350)).toBe(false); expect(f(350,350)).toBe(false);
  });
  it('333 distinguishes', () => {
    expect(orig(266,333)).toBe(true); expect(orig(267,333)).toBe(false);
    expect(mut(266,333)).toBe(false);
  });
});
