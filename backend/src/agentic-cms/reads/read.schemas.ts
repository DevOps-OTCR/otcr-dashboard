import * as z from 'zod';
import { DeliverableStatus, DeliverableType, DeliverableTemplateKind, DueDateSource, SubmissionStatus } from '@prisma/client';

const id = z.string().trim().min(1).max(200);
const projectId = id.describe('CMS project ID supplied by the selected project or the user. These tools do not discover projects; do not guess IDs.');
const workstreamId = id.describe('A workstreams.items[].id returned by list_workstreams, belonging to the same projectId.');
const timestamp = z.iso.datetime();
const pagination = {
  limit: z.number().int().min(1).max(50).default(20).describe('Maximum items per batch, default 20 and maximum 50. A batch is not necessarily the full collection.'),
  cursor: z.string().min(1).max(4096).optional().describe('Exact nextCursor from the same tool, project, parent/section and filters. Omit on the first call; stop when nextCursor is null.'),
};
export const listWorkstreamsInput = z.strictObject({
  projectId, currentOnly: z.boolean().default(false).describe('Use true for current/this-week workstreams, based on project timezone. False lists all visible weeks, including past and future.'),
  asOf: z.iso.datetime({ offset: true }).optional().describe('Optional timestamp with timezone offset for currentOnly=true; defaults to now. Keep the same argument on continuation calls.'), ...pagination,
}).refine(input => !input.asOf || input.currentOnly, { message: 'asOf requires currentOnly' });
export const getWorkstreamInput = z.strictObject({ projectId, workstreamId, ...pagination });
export const listDeliverablesInput = z.strictObject({
  projectId, workstreamId: workstreamId.optional(),
  status: z.enum(DeliverableStatus).optional().describe('Optional exact stored CMS status. OVERDUE matches the stored value; it is not calculated from the deadline. Omit to include all visible statuses.'), ...pagination,
});
export const getDeliverableInput = z.strictObject({
  projectId, deliverableId: id.describe('A deliverables.items[].id from list_deliverables or get_workstream, belonging to the same projectId.'),
  section: z.enum(['overview', 'assignments', 'subtasks', 'submissions']).default('overview')
    .describe('overview: full description and metadata; assignments: assigned people; subtasks: actionable steps; submissions: submitted links, CMS versions and recorded feedback. Collections are paginated.'),
  limit: z.number().int().min(1).max(50).optional().describe('Only for assignments/subtasks/submissions: batch size, default 20, maximum 50. Omit for overview.'), cursor: pagination.cursor,
}).refine(input => input.section !== 'overview' || (input.limit === undefined && input.cursor === undefined), {
  message: 'Overview does not accept pagination',
});

const metadata = {
  schemaVersion: z.literal('1'), retrievedAt: timestamp,
  truncatedFields: z.array(z.string()).describe('JSON pointers to shortened text. Preview fields stop at 600 Unicode code points; detail text stops at 12000. Do not treat shortened text as complete.'),
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
const workstreamListItem = workstreamSummary.extend({
  generalNotesPreview: z.string().nullable().describe('Up to 600 Unicode code points of workstream notes, or null when absent. Use get_workstream for full generalNotes; check truncatedFields.'),
});
const deliverableListItem = deliverableSummary.extend({
  descriptionPreview: z.string().nullable().describe('Up to 600 Unicode code points of the deliverable description, or null when absent. Use get_deliverable overview for the full description; check truncatedFields.'),
});
export const page = <T extends z.ZodType>(item: T) => z.strictObject({
  items: z.array(item).max(50), nextCursor: z.string().nullable(),
});
export const listWorkstreamsOutput = z.strictObject({
  ...metadata, projectId: id, timezone: z.string(), effectiveAsOf: timestamp.nullable(),
  workstreams: page(workstreamListItem),
});
export const getWorkstreamOutput = z.strictObject({
  ...metadata, timezone: z.string(), workstream: workstreamSummary.extend({ generalNotes: z.string().nullable() }),
  deliverablesAccess: z.enum(['allowed', 'denied']).describe('denied means nested deliverables are not available to this caller, not that none exist.'),
  deliverables: page(deliverableListItem).nullable(),
});
export const listDeliverablesOutput = z.strictObject({
  ...metadata, projectId: id, deliverables: page(deliverableListItem),
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
