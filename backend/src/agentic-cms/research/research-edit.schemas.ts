import { z } from 'zod';
import { versionSchema } from './research.schemas';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const title = z.string().trim().min(1).max(300);
export const researchEditInput = z.strictObject({
  expectedVersion: versionSchema, prompt: z.string().trim().min(1).max(4000),
  clarifications: z.array(z.strictObject({ question: z.string().min(1).max(600), answer: z.string().trim().min(1).max(2000) })).max(3).default([]),
});
export const researchEditOperation = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('set_section'), sectionId: id, title: title.optional(), content: z.string().max(50000).optional(), sourceIds: z.array(id).max(200).optional() }),
  z.strictObject({ kind: z.literal('clear_section'), sectionId: id }),
  z.strictObject({ kind: z.literal('set_objective'), objective: z.string().max(1000) }),
  z.strictObject({ kind: z.literal('add_bucket'), ref: id, title }),
  z.strictObject({ kind: z.literal('rename_bucket'), bucketId: id, title }),
  z.strictObject({ kind: z.literal('remove_bucket'), bucketId: id }),
  z.strictObject({ kind: z.literal('add_question'), ref: id, bucketId: id, title, evidence: z.string().max(1000) }),
  z.strictObject({ kind: z.literal('edit_question'), questionId: id, title: title.optional(), evidence: z.string().max(1000).optional() }),
  z.strictObject({ kind: z.literal('remove_question'), questionId: id }),
  z.strictObject({ kind: z.literal('reorder_buckets'), ids: z.array(id).max(8) }),
  z.strictObject({ kind: z.literal('reorder_questions'), bucketId: id, ids: z.array(id).max(30) }),
]);
export const researchEditOutput = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('clarification'), question: z.string().trim().min(1).max(600) }),
  z.strictObject({ status: z.literal('no_change'), message: z.string().trim().min(1).max(600) }),
  z.strictObject({ status: z.literal('edit'), summary: z.string().trim().min(1).max(600), operations: z.array(researchEditOperation).min(1).max(40) }),
]);
export type ResearchEditOperation = z.infer<typeof researchEditOperation>;
