import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { frameworkSchema } from './framework.schemas';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const tabSchema = z.enum(['past-data', 'framework', 'findings']);
const sectionSchema = z.strictObject({
  id,
  tab: tabSchema,
  title: z.string().trim().min(1).max(300),
  content: z.string().max(50_000),
  sourceIds: z.array(id).max(200),
  frameworkQuestionId: id.optional(),
});
const sourceSchema = z.strictObject({
  id,
  readStatus: z.enum(['cms-record', 'extracted-page']).optional(),
  excerpt: z.string().max(5000).optional(),
  accessedAt: z.iso.datetime().optional(),
  title: z.string().trim().min(1).max(500),
  url: z.url().max(2048).refine(value => ['http:', 'https:'].includes(new URL(value).protocol)),
});

export const documentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  framework: frameworkSchema.optional(),
  frameworkSuggestion: frameworkSchema.optional(),
  sections: z.array(sectionSchema).min(3).max(100),
  sources: z.array(sourceSchema).max(200),
}).superRefine((document, ctx) => {
  const sections = new Set(document.sections.map(section => section.id));
  const sources = new Set(document.sources.map(source => source.id));
  if (sections.size !== document.sections.length || sources.size !== document.sources.length) {
    ctx.addIssue({ code: 'custom', message: 'Section and source IDs must be unique.' });
  }
  for (const tab of tabSchema.options) {
    if (!document.sections.some(section => section.id === tab && section.tab === tab)) {
      ctx.addIssue({ code: 'custom', message: `Missing ${tab} root section.` });
    }
  }
  if (document.sections.some(section => section.sourceIds.some(source => !sources.has(source)))) {
    ctx.addIssue({ code: 'custom', message: 'Every citation must reference a stored source.' });
  }
  const questions = document.framework?.buckets.flatMap(b => b.questions) ?? [];
  const linked = document.sections.filter(s => s.frameworkQuestionId);
  if (linked.some(s => s.tab !== 'findings' || !questions.some(q => q.id === s.frameworkQuestionId))
    || questions.some(q => linked.filter(s => s.frameworkQuestionId === q.id).length !== 1)) {
    ctx.addIssue({ code: 'custom', message: 'Every chosen question must have exactly one linked Findings section.' });
  }
  if (JSON.stringify(document).length > 200_000) {
    ctx.addIssue({ code: 'custom', message: 'Research document is too large.' });
  }
});

export type ResearchDocument = z.infer<typeof documentSchema>;
export const versionSchema = z.number().int().min(1).max(2_147_483_646);
export const saveSchema = z.strictObject({ expectedVersion: versionSchema, document: documentSchema });
export const editSectionSchema = z.strictObject({
  expectedVersion: versionSchema,
  title: sectionSchema.shape.title.optional(),
  content: sectionSchema.shape.content.optional(),
  sourceIds: sectionSchema.shape.sourceIds.optional(),
}).refine(value => value.title !== undefined || value.content !== undefined || value.sourceIds !== undefined,
  'Supply a section change.');
export const restoreSchema = z.strictObject({ expectedVersion: versionSchema, targetVersion: versionSchema });
export const historySchema = z.strictObject({
  beforeVersion: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function parseResearch<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException({ code: 'INVALID_ARGUMENT', message: 'Invalid research request.' });
  return parsed.data;
}

export function emptyResearchDocument(): ResearchDocument {
  return {
    schemaVersion: 1,
    sections: [
      { id: 'past-data', tab: 'past-data', title: 'Relevant Past Data', content: '', sourceIds: [] },
      { id: 'framework', tab: 'framework', title: 'Framework / Structure', content: '', sourceIds: [] },
      { id: 'findings', tab: 'findings', title: 'Findings', content: '', sourceIds: [] },
    ],
    sources: [],
  };
}
