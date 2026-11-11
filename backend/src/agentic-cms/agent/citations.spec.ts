import { checkCitations } from './citations';

const sources = [
  { id: 1, title: 'A', url: 'https://a.test' },
  { id: 2, title: 'B', url: 'https://b.test' },
  { id: 3, title: 'C', url: 'https://c.test' },
];

describe('checkCitations', () => {
  it('keeps only the sources the answer cited, in source order', () => {
    expect(checkCitations('Second [3], first [1], again [1].', sources)).toEqual({
      cited: [sources[0], sources[2]],
      invalid: [],
    });
  });

  it('reports numbers that match no source', () => {
    expect(checkCitations('Real [2], invented [9].', sources)).toEqual({ cited: [sources[1]], invalid: [9] });
  });

  it('returns nothing when the answer cites nothing', () => {
    expect(checkCitations('No citations here.', sources)).toEqual({ cited: [], invalid: [] });
  });

  it('reads grouped and ranged citations such as [1, 2] and [2-3]', () => {
    expect(checkCitations('Both [1, 2]. Range [2-3].', sources)).toEqual({ cited: sources, invalid: [] });
  });

  it('does not treat claim IDs such as [S3] as source numbers', () => {
    expect(checkCitations('Claim [S3] and [I1].', sources)).toEqual({ cited: [], invalid: [] });
  });

  it('ignores markdown links such as [1](https://example.com)', () => {
    expect(checkCitations('See [1](https://example.com).', sources)).toEqual({ cited: [], invalid: [] });
  });
});
