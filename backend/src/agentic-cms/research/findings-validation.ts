import { z } from 'zod';
import { findingsOutput } from './research-findings.schemas';

type Output = z.infer<typeof findingsOutput>;
type Source = { id: string; text: string; kind: 'cms' | 'web' };

/** Ignore layout whitespace only, then return the actual verbatim source span. */
export function sourceQuote(text: string, quote: string): string | undefined {
  if (text.includes(quote)) return quote;
  const tokens = quote.trim().split(/\s+/u);
  if (!tokens.length || !tokens[0]) return undefined;
  const expression = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const match = new RegExp(expression, 'u').exec(text);
  return match && match[0].length <= 500 ? match[0] : undefined;
}

export function needsEvidenceCorrection(output: Output, sources: Source[]) {
  return output.questions.some(q => q.claims.some(c => c.evidence.some(e => {
    const source = sources.find(s => s.id === e.sourceId);
    return !source || !sourceQuote(source.text, e.quote);
  })));
}

/** Keep supported answers; do not publish an unsupported claim or lose other answers. */
export function recoverFindings(output: Output, questionIds: string[], sources: Source[]) {
  let omittedClaims = 0; let missingAnswers = 0;
  const questions = questionIds.map(questionId => {
    const matches = output.questions.filter(q => q.questionId === questionId);
    if (matches.length !== 1) {
      missingAnswers++;
      return { questionId, claims: [], implication: '', gaps: ['A complete answer was not returned for this question. Existing findings were kept; this question needs further research.'] };
    }
    const answer = structuredClone(matches[0]); const originalCount = answer.claims.length;
    answer.claims = answer.claims.flatMap(claim => {
      const evidence = claim.evidence.map(e => {
        const source = sources.find(s => s.id === e.sourceId);
        const quote = source && sourceQuote(source.text, e.quote);
        return quote ? { ...e, quote } : undefined;
      });
      if (evidence.some(e => !e)) return [];
      // A model label cannot upgrade a client statement into an external fact.
      const type = claim.type === 'FACT' && evidence.some(e => sources.find(s => s.id === e!.sourceId)?.kind === 'cms') ? 'SUPPLIED' as const : claim.type;
      return [{ ...claim, type, evidence: evidence.filter((e): e is NonNullable<typeof e> => !!e) }];
    });
    const removed = originalCount - answer.claims.length; omittedClaims += removed;
    if (removed) {
      answer.gaps.push('A draft claim was omitted because its citation or quotation could not be verified. Review the source or research this question again.');
      answer.implication = '';
    }
    if (!answer.claims.length) {
      answer.implication = '';
      if (!answer.gaps.length) answer.gaps.push('The searched evidence does not support an answer yet. Further research is needed.');
    }
    return answer;
  });
  return { questions, omittedClaims, missingAnswers };
}
