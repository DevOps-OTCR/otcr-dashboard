import { z } from 'zod';
import { versionSchema } from './research.schemas';

export const findingsInput = z.strictObject({
  expectedVersion: versionSchema, mode: z.enum(['add', 'revise']), focus: z.string().trim().max(1000).default(''),
});
export const findingsPlan = z.strictObject({ queries: z.array(z.string().trim().min(2).max(300)).max(6) });
export const findingsOutput = z.strictObject({ questions: z.array(z.strictObject({
  questionId: z.string().min(1).max(100),
  claims: z.array(z.strictObject({ text: z.string().trim().min(1).max(800), type: z.enum(['FACT', 'SUPPLIED', 'INFERENCE']),
    evidence: z.array(z.strictObject({ sourceId: z.string().max(100), quote: z.string().min(10).max(500) })).min(1).max(3),
  })).max(8),
  implication: z.string().max(800), gaps: z.array(z.string().trim().min(1).max(500)).max(8),
})).min(1).max(8) });

export const findingsCoverage = z.strictObject({
  queries: z.array(z.string().trim().min(2).max(300)).max(2),
  gaps: z.array(z.strictObject({ questionId: z.string().max(100), missingEvidence: z.string().min(1).max(500) })).max(8),
});
