import * as z from 'zod';
import { DeliverableStatus, DeliverableType, DeliverableTemplateKind, DueDateSource, SubmissionStatus } from '@prisma/client';

const id = z.string().trim().min(1).max(200);
const timestamp = z.iso.datetime();
const pagination = {
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(4096).optional(),
};
export const listWorkstreamsInput = z.strictObject({
  projectId: id, currentOnly: z.boolean().default(false),
  asOf: z.iso.datetime({ offset: true }).optional(), ...pagination,
}).refine(input => !input.asOf || input.currentOnly, { message: 'asOf requires currentOnly' });
export const getWorkstreamInput = z.strictObject({ projectId: id, workstreamId: id, ...pagination });
export const listDeliverablesInput = z.strictObject({
  projectId: id, workstreamId: id.optional(), status: z.enum(DeliverableStatus).optional(), ...pagination,
});
export const getDeliverableInput = z.strictObject({
  projectId: id, deliverableId: id,
  section: z.enum(['overview', 'assignments', 'subtasks', 'submissions']).default('overview'),
  limit: z.number().int().min(1).max(50).optional(), cursor: pagination.cursor,
}).refine(input => input.section !== 'overview' || (input.limit === undefined && input.cursor === undefined), {
  message: 'Overview does not accept pagination',
});

const metadata = {
  schemaVersion: z.literal('1'), retrievedAt: timestamp, truncatedFields: z.array(z.string()),
};
const user = z.strictObject({ id, displayName: z.string().nullable() });
export const workstreamSummary = z.strictObject({
  id, projectId: id, label: z.string(), sequenceNumber: z.number().int(),
  status: z.enum(['DRAFT', 'RELEASED']), weekStartDate: timestamp, weekEndDate: timestamp, updatedAt: timestamp,
});
export const deliverableSummary = z.strictObject({
  id, projectId: id, workstreamId: id.nullable(), title: z.string(), type: z.enum(DeliverableType),
  templateKind: z.enum(DeliverableTemplateKind), deadline: timestamp, status: z.enum(DeliverableStatus),
  completed: z.boolean(), updatedAt: timestamp,
});
export const page = <T extends z.ZodType>(item: T) => z.strictObject({
  items: z.array(item).max(50), nextCursor: z.string().nullable(),
});
export const listWorkstreamsOutput = z.strictObject({
  ...metadata, projectId: id, timezone: z.string(), effectiveAsOf: timestamp.nullable(),
  workstreams: page(workstreamSummary),
});
export const getWorkstreamOutput = z.strictObject({
  ...metadata, timezone: z.string(), workstream: workstreamSummary.extend({ generalNotes: z.string().nullable() }),
  deliverablesAccess: z.enum(['allowed', 'denied']), deliverables: page(deliverableSummary).nullable(),
});
export const listDeliverablesOutput = z.strictObject({
  ...metadata, projectId: id, deliverables: page(deliverableSummary),
});
const detailBase = { ...metadata, projectId: id, deliverableId: id, sourceUpdatedAt: timestamp };
export const getDeliverableOutput = z.discriminatedUnion('section', [
  z.strictObject({
    ...detailBase, section: z.literal('overview'),
    deliverable: deliverableSummary.extend({ description: z.string().nullable(), dueDateSource: z.enum(DueDateSource), createdAt: timestamp }),
    availableSections: z.tuple([z.literal('assignments'), z.literal('subtasks'), z.literal('submissions')]),
  }),
  z.strictObject({
    ...detailBase, section: z.literal('assignments'),
    assignments: page(z.strictObject({ user, assignedAt: timestamp.nullable() })),
  }),
  z.strictObject({
    ...detailBase, section: z.literal('subtasks'),
    subtasks: page(z.strictObject({
      id, title: z.string(), notes: z.string().nullable(), dueDate: timestamp.nullable(), completed: z.boolean(),
      assignee: user.nullable(), createdAt: timestamp, updatedAt: timestamp,
    })),
  }),
  z.strictObject({
    ...detailBase, section: z.literal('submissions'),
    submissions: page(z.strictObject({
      id, submitter: user, fileName: z.string(), fileUrl: z.string(), mimeType: z.string().nullable(),
      fileSize: z.number().int(), status: z.enum(SubmissionStatus), version: z.number().int(), replacesId: id.nullable(),
      submittedAt: timestamp, isLate: z.boolean(), reviewedById: id.nullable(), reviewedAt: timestamp.nullable(),
      feedback: z.string().nullable(), contentAvailability: z.literal('link_only'),
    })),
  }),
]);
