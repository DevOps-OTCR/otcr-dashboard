import { claimIds, dataFlagCount, sourceIds, stripEvidenceTags } from './evidence-tags';

describe('evidence tags', () => {
  describe('sourceIds: [n] UI source-link numbers', () => {
    it('reads single, adjacent, grouped and ranged citations', () => {
      expect(sourceIds('a [1] b [2][3] c [4, 5] d [6-8] e [9; 10]')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('ignores markdown links', () => {
      expect(sourceIds('See [1](https://example.com) and [2, 3](https://x.test).')).toEqual([]);
    });

    it('keeps claim IDs out of the source-number space', () => {
      expect(sourceIds('claim [S3] and [I2] and [S1, I4]')).toEqual([]);
    });

    it('does not expand an implausible range', () => {
      expect(sourceIds('[1-100000]')).toEqual([1, 100000]);
    });
  });

  describe('claimIds: S#/I# evidence-ledger IDs', () => {
    it('reads bracketed and parenthesised lists, including estimate labels', () => {
      expect(claimIds('x [S1] y [S2; I3] z (S4, I5) [S3a] [ESTIMATE: S6, I7]')).toEqual(['I3', 'I5', 'I7', 'S1', 'S2', 'S3a', 'S4', 'S6']);
    });

    it('never reads a bare [n] as a claim ID', () => {
      expect(claimIds('[3]')).toEqual([]);
    });
  });

  it('counts [DATA NEEDED] flags', () => {
    expect(dataFlagCount('a [DATA NEEDED: churn] b [data needed] c')).toBe(2);
  });

  describe('stripEvidenceTags', () => {
    it('removes ID tags and keeps the prose inside an estimate label', () => {
      expect(stripEvidenceTags('A [1] B [S1, I2] C [ESTIMATE: S3] D [ESTIMATE: about a third] E').replace(/\s+/g, ' ')).toBe(
        'A B C D about a third E',
      );
    });

    it('keeps [DATA NEEDED] flags', () => {
      expect(stripEvidenceTags('x [DATA NEEDED: revenue]')).toContain('[DATA NEEDED: revenue]');
    });
  });
});
