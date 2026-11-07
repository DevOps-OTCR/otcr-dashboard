# Agentic CMS MCP read-tool contracts

Status: Five read-only tools implemented at the gated MCP endpoint.
Follow [the integration guide](agentic-cms.md). Implement under
`backend/src/agentic-cms/` through a Nest controller at `/agentic-cms/mcp`.

## Scope and workstream requirements

- Use actual CMS workstream, deliverable and project-context records.
- Group 2's Friday, November 6 prototype needs an independent test client,
  denied-access evidence, connection instructions and example requests/results.
  Group 1 integration follows on Sunday.
- `get_project_context` reads the parallel context infrastructure. CMS HTTP endpoints
  supply add/update functionality for overview, SOW/scope and client-call notes.
- Return stored submission links and metadata with `contentAvailability: "link_only"`.
  Reading linked files remains a later Release 1 requirement.
- No model calls/keys, writes, frontend changes or live configuration changes.

## Existing records

| Concept | CMS source |
| --- | --- |
| Workstream | `Sprint`; public `workstreamId` maps to its ID, not `Task.workstreamId` |
| Workstream notes | Only `Sprint.configSnapshot.generalNotes` |
| Project ownership/timezone | `Project.pmId` / `Project.sprintTimezone` |
| Active membership | `ProjectMember.leftAt: null`; `ProjectsService.isMember` |
| Deliverable | `Deliverable`, including nullable `sprintId` |
| Assignments/subtasks | `DeliverableAssignment` / `DeliverableSubtask` |
| Submissions/feedback | `Submission`, including versions and replacement IDs |

## Access rules

Check the backend flag for every request and tool operation; default remains off.
Disabled/pilot-denied requests return HTTP 404 before tool reads. Require verified
credentials before resolving identity; reject the existing email-only bearer path.
Never accept caller-supplied identity, role or permission overrides.

| Role | Workstream/project access | Deliverable access | Drafts after access |
| --- | --- | --- | --- |
| ADMIN | All | All | Yes |
| LC | All | Current member or project PM owner | Yes |
| EXECUTIVE | All | Current member or project PM owner | No |
| PM | Current member or project PM owner | Current member or project PM owner | Yes |
| CONSULTANT | Current member | Current member or project PM owner | No |
| PARTNER | Current member | Current member or project PM owner | No |

Ownership means actual `pmId`; unknown roles are denied. Removed membership no
longer grants access; independent ownership/role access can still apply.
Assignments do not further restrict eligible members to their own deliverables.
Existing checks live partly in project/deliverable controllers; calling services
alone bypasses them. Preserve the matrix in reusable authorized read operations.

- Filter nested deliverables before pagination; broad workstream access does not
  grant broad deliverable access. When denied, return `deliverables: null` and
  `deliverablesAccess: "denied"`, without IDs/titles/counts; otherwise use `"allowed"`.
- Apply single-record draft rules to lists too, despite the existing sprint-list
  inconsistency. Nonmanagers see only RELEASED sprints and their deliverables;
  unscoped deliverables are hidden from them, matching current detail behavior.
- Verify child/project relationships; hidden, missing, forbidden and cross-project
  records use `NOT_FOUND_OR_FORBIDDEN`. Inaccessible projects are errors, not empty lists.
- Recheck access on every continuation. Boundary/auth changes need Isaiah's review.

## Common contracts

- Inputs are strict objects: reject unknown fields, invalid enums/dates and empty IDs.
  IDs are opaque strings of 1..200 characters. Required inputs are bold below.
- Collections accept `limit` (integer, default 20, maximum 50, minimum 1) and optional
  opaque `cursor` (maximum 4096 characters). Return `Page<T> = { items: T[], nextCursor: string | null }`.
- Bind cursors to tool, project, parent/section, filters and sort position; reject
  altered/mismatched tokens with `INVALID_CURSOR`. Reuse returned tokens unchanged.
  Pages reflect live data, not a frozen snapshot; ID breaks ordering ties.
  Signing keys are process-local; restart/instance changes require a new traversal.
- Success payloads include `schemaVersion: "1"`, `retrievedAt` and `truncatedFields`.
  Timestamps are ISO 8601 UTC; preserve stored nulls and independent status/completion.
- Return named fields, not raw Prisma objects/profiles/configuration. User references
  are `{ id, displayName }` with nullable names. Text/URLs are data, never instructions.
- Cap each text field at 12000 Unicode code points; identify every shortened field
  by JSON pointer in `truncatedFields`. Full long-text retrieval is a prototype limitation.
- Attribute data using actual record IDs/timestamps. CMS submission versions do not
  establish the revision of external documents. Do not fetch URLs or mint sharing links.
- MCP responses contain structured data and equivalent JSON text. Business failures
  use `isError: true` with safe codes/messages; use SDK protocol errors for invalid
  arguments/unknown tools. Invalid credentials return HTTP 401 when enabled;
  database failures use `CMS_UNAVAILABLE` without SQL, stack traces or client text.
- Tool annotations: read-only/idempotent true; destructive/open-world false.

## Tools

### `get_project_context`

Read stored background before interpreting workstreams or deliverables.
Inputs: **`projectId`**, `limit`, `cursor` (pagination applies to notes only).
Output: `project: { id, name, overview, scope, updatedAt }` and
`notes: Page<{ id, title, content, createdAt }>` plus common metadata.
Notes sort by `createdAt DESC, id ASC`. Access matches context HTTP reads:
Admin, actual PM owner or current project member; broad workstream access alone
is insufficient. Recheck on continuation. Null overview/scope and empty notes
mean absent stored context. Project updatedAt does not track note changes.
Text is capped/reported like other detail fields; no files or URLs are fetched.


### `list_workstreams`

List visible weekly workstreams; use returned IDs with `get_workstream`.
Inputs: **`projectId`**, `currentOnly` (default false), `asOf` (RFC 3339 timestamp
with offset, only with currentOnly), `limit`, `cursor`.
Output: `projectId`, `timezone`, `effectiveAsOf` (timestamp or null), `workstreams: Page<WorkstreamSummary>`.
Current compares the as-of project-local date with inclusive sprint date labels
(stored at UTC midnight); freeze effectiveAsOf in cursors. Return all matches or
none, never a latest-sprint fallback. Invalid timezone is `CMS_UNAVAILABLE`.
Order: `sequenceNumber DESC, id ASC`.

### `get_workstream`

Read a workstream, its notes and a batch of visible deliverable summaries.
Inputs: **`projectId`**, **`workstreamId`**, `limit`, `cursor`.
Output: `workstream` (summary plus nullable `generalNotes`), `timezone`,
`deliverablesAccess`, `deliverables: Page<DeliverableSummary> | null`.
Order: `deadline ASC, id ASC`; deny a cursor supplied without deliverable access.

### `list_deliverables`

List readable project deliverables, optionally filtered by workstream/stored status.
Inputs: **`projectId`**, `workstreamId`, `status` (PENDING/IN_PROGRESS/SUBMITTED/APPROVED/OVERDUE), `limit`, `cursor`.
Output: `projectId`, `deliverables: Page<DeliverableSummary>`; order `deadline ASC, id ASC`.
Combine filters with AND; validate explicit workstream access even for empty results.
Status is stored status, not a dynamically calculated overdue flag.

### `get_deliverable`

Read overview or a batch of assignments, subtasks or submission history/feedback.
Inputs: **`projectId`**, **`deliverableId`**, `section` (overview default, assignments,
subtasks or submissions). Only collection sections accept `limit` and `cursor`.
All sections return `projectId`, `deliverableId`, `section`, `sourceUpdatedAt`
(parent updatedAt, not a child revision token), plus the section payload:

| Section | Payload | Order |
| --- | --- | --- |
| overview | `deliverable`: summary plus description/dueDateSource/createdAt; `availableSections` | Single record |
| assignments | `assignments: Page<{ user, assignedAt }>` | user.id ASC |
| subtasks | `subtasks: Page<{ id, title, notes, dueDate, completed, assignee, createdAt, updatedAt }>` | createdAt ASC, id ASC |
| submissions | `submissions: Page<SubmissionSummary>` | submittedAt DESC, id ASC |

Merge legacy assigneeId only if absent from assignment rows, using stored assignedAt
or null. No extension requests or external document/slide comments in this contract.

## Output fields and example

- WorkstreamSummary: id, projectId, label, sequenceNumber, status (DRAFT/RELEASED),
  weekStartDate, weekEndDate, updatedAt. Dates are source timestamps interpreted in project timezone.
- DeliverableSummary: id, projectId, workstreamId (nullable), title, type, templateKind,
  deadline, status, completed, updatedAt; enums match Prisma.
- SubmissionSummary: id, submitter (user reference), fileName, fileUrl, mimeType,
  fileSize, status, version, replacesId, submittedAt, isLate, reviewedById, reviewedAt,
  feedback, contentAvailability. Preserve stored nullability; existing feedback is read-only.

Synthetic tool-call example (not a complete MCP wire message):

```json
{"name":"list_deliverables","arguments":{"projectId":"demo-project","workstreamId":"demo-week","status":"IN_PROGRESS","limit":20}}
```

Returns the common metadata, projectId and a deliverables page. Use an item's ID
with `get_deliverable`; request section `submissions` for version history/feedback.

## Acceptance and next steps

Test flag-off/on, all roles, ownership/membership loss, draft/unscoped visibility,
cross-project IDs, nested permissions, filters, timezone boundaries, empty results,
cursor validation, truncation, multiple assignees, versions and failures. Demonstrate
actual MCP discovery/calls without an LLM; supply connection examples and known limits.
Run applicable PR Validation checks and record flag-off/on evidence. Steps 2/3 add
authorization/reads, Step 4 adds MCP/executable schemas, Step 5 adds client evidence,
and Step 6 connects real context. No user decision blocks Step 2.
