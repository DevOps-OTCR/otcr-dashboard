import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const title = z.string().trim().min(1).max(300);
export const frameworkQuestionSchema = z.strictObject({ id, title, evidence: z.string().max(1000) });
const group = z.strictObject({ id, title, questions: z.array(frameworkQuestionSchema).max(10) });
// Read earlier snapshots without changing question IDs or their linked findings.
const bucket = z.union([
  z.strictObject({ id, title, questions: z.array(frameworkQuestionSchema).max(30) }),
  z.strictObject({ id, title, groups: z.array(group).max(6) }).transform(b => ({ id: b.id, title: b.title, questions: b.groups.flatMap(g => g.questions) })),
]);
export const frameworkSchema = z.strictObject({
  objective: z.string().max(1000), buckets: z.array(bucket).max(8),
  assumptions: z.array(z.string().min(1).max(600)).max(6),
  clarificationQuestions: z.array(z.string().min(1).max(600)).max(6),
}).superRefine((tree, ctx) => {
  const ids = tree.buckets.flatMap(b => [b.id, ...b.questions.map(q => q.id)]);
  if (ids.length !== new Set(ids).size) ctx.addIssue({ code: 'custom', message: 'Framework IDs must be unique.' });
  if (tree.buckets.flatMap(b => b.questions).length > 30) ctx.addIssue({ code: 'custom', message: 'At most 30 research questions.' });
});
export type ResearchFramework = z.infer<typeof frameworkSchema>;
export const frameworkOutputSchema = z.strictObject({
  objective: z.string().trim().min(1).max(1000),
  buckets: z.array(z.strictObject({ title, questions: z.array(frameworkQuestionSchema.omit({ id: true })).min(1).max(8) })).min(1).max(5),
  assumptions: z.array(z.string().min(1).max(600)).max(6),
  clarificationQuestions: z.array(z.string().min(1).max(600)).max(6),
});
