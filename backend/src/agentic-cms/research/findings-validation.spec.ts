import { sourceQuote, recoverFindings } from './findings-validation';

const source = { id: 's', kind: 'cms' as const, text: 'Client decision:\n  exclude enterprise buyers because of budget.' };
const claim = { text: 'A paraphrased explanation of the recorded client constraint.', type: 'SUPPLIED' as const, evidence: [{ sourceId: 's', quote: source.text }] };
describe('finding evidence recovery', () => {
  it('accepts layout whitespace differences and stores the original source wording', () => {
    expect(sourceQuote(source.text, 'Client decision: exclude enterprise buyers because of budget.')).toBe(source.text);
    expect(sourceQuote('Price is $5.00 (USD).', '$5.00 (USD).')).toBe('$5.00 (USD).');
  });
  it('does not accept omitted, altered or rearranged words as a quotation', () => {
    expect(sourceQuote(source.text, 'Client decision: exclude buyers because of budget.')).toBeUndefined();
    expect(sourceQuote(source.text, 'Client decision: include enterprise buyers because of budget.')).toBeUndefined();
  });
  it('allows paraphrased claim text while checking only the quoted evidence verbatim', () => {
    const result = recoverFindings({ questions: [{ questionId: 'q', claims: [claim], implication: 'A cautious interpretation.', gaps: [] }] }, ['q'], [source]);
    expect(result.omittedClaims).toBe(0); expect(result.questions[0].claims[0].text).toBe(claim.text);
  });
  it('drops one unsupported claim and preserves the supported claims and other questions', () => {
    const bad = { ...claim, evidence: [{ sourceId: 's', quote: 'An invented assertion about the budget.' }] };
    const result = recoverFindings({ questions: [{ questionId: 'q1', claims: [claim, bad], implication: 'May depend on the bad claim.', gaps: [] }, { questionId: 'q2', claims: [claim], implication: '', gaps: [] }] }, ['q1', 'q2'], [source]);
    expect(result.omittedClaims).toBe(1); expect(result.questions[0].claims).toHaveLength(1);
    expect(result.questions[0].implication).toBe(''); expect(result.questions[0].gaps.join(' ')).toContain('omitted');
    expect(result.questions[1].claims).toHaveLength(1);
  });
  it('turns missing or duplicate answers into explicit gaps and ignores unknown targets', () => {
    const row = { questionId: 'q1', claims: [claim], implication: '', gaps: [] };
    const result = recoverFindings({ questions: [row, row, { ...row, questionId: 'other' }] }, ['q1', 'q2'], [source]);
    expect(result.missingAnswers).toBe(2); expect(result.questions.map(q => q.questionId)).toEqual(['q1', 'q2']);
    expect(result.questions.every(q => q.claims.length === 0 && q.gaps.length > 0)).toBe(true);
  });
});
