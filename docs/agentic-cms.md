# Agentic CMS development

All Agentic CMS features use one backend-controlled release flag. This includes
OTCR Bot, new project-context upload/reading features, MCP tools, skill loading,
research, automated review and later document/slide editing.

## Configure access

Set these in the backend's local `.env` or its Render Environment settings:

```dotenv
AGENTIC_CMS_ENABLED=false
AGENTIC_CMS_ALLOWED_EMAILS=
LUMEN_BASE_URL=https://lumen.ncsa.illinois.edu/v1
LUMEN_MODEL=deepseek-v4.1-flash
LUMEN_API_KEY=
```

Only the exact value `true` enables the flag. Missing, false or invalid values
keep it off. With the flag on, a blank allowlist enables authenticated users;
use comma-separated email addresses to restrict a pilot. Emails are matched
without case sensitivity. Set the list to your own email for local testing.
The flag does not replace project membership, roles or document permissions.

Production and the checked-in staging Blueprint default to off. Isaiah decides
when to enable a shared pilot and enters his key in the agent backend's hosting
settings. Consultants use their own Lumen accounts/keys locally and must read
and acknowledge the model notices in Lumen. Provider credentials remain on the
backend. No live credentials or model requests are needed for CI.

Environment changes require restarting/redeploying the backend. To roll back,
set `AGENTIC_CMS_ENABLED=false` and restart the service. New AI HTTP requests
then return 404. The browser rechecks every 30 seconds and on window focus;
it hides the feature on a failed check or sign-out. Already-running work needs
the explicit checks described below; changing a flag does not cancel an
in-flight request or undo a completed write.

## Where each group builds

| Group                        | Required integration boundary                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: agent backend and sidebar | Add providers, orchestration and chat endpoints under `backend/src/agentic-cms/`; mount the bot from `frontend/features/agentic-cms/index.tsx`.                                                                        |
| 2: context and MCP tools     | Add new context endpoints under `/agentic-cms/context` and MCP under `/agentic-cms/mcp`. New upload controls belong inside the same frontend feature folder. Reuse existing CMS authorization/services for read tools. |
| 3: skills                    | Store instructions/resources under `agentic-cms/skills/`. The gated agent loads them on demand. Test synthetic examples locally with your own key.                                                                     |

The protected `/agentic-cms/status` endpoint is a connection check, not a chat
implementation. `GET /feature-flags` returns only `{ "agenticCms": boolean }`
for the signed-in user, with no secrets or allowlist in the response. The
frontend has one access-gated entry point, `components/AgenticCmsFeature.tsx`, mounted
in the application layout. Feature components and their effects must stay
inside it; do not mount a second sidebar or import feature code into existing
CMS pages. A failure or an older backend that lacks this endpoint keeps it off.

## Project context (current implementation)

The gated page is available at `/agentic-cms`. Its Project Context tab stores a
project overview and SOW/scope text; its Client Call Notes tab stores titled,
pasted note text with a creation timestamp. These fields are attached to the
existing project. The existing project description remains separate. Existing
link-based submissions on `/client-notes` continue to work and are not migrated.

Context data is stored in `Project.overview`, `Project.scope`, and
`ProjectContextNote`. Apply the committed backend Prisma migrations when setting
up a local database. The HTTP API is under `/agentic-cms/context/projects/:projectId`:
GET reads project context and notes, PUT updates overview and scope, POST adds a
call note, and DELETE removes a call note.

The `20261106180000_project_overview` migration uses `ADD COLUMN IF NOT EXISTS`
because `20261106090000_project_context` already creates `overview`. Both migration
names are retained. Before shared rollout, inspect `_prisma_migrations`: the later
SQL file has changed, so an already-recorded checksum or failed migration may need
reconciliation. Do not reset a shared database or delete its migration history.

The global feature flag and pilot allowlist gate both the interface and these
endpoints. Context reads also require project access. Writes are restricted to
Admins, LCs with project access, and the PM assigned to that project. The UI
uses the shared `getEffectiveRole` resolver, including the local role-switcher
override; it shows edit controls only to those write roles. Users without
accessible projects do not see the context tabs. No MCP endpoint currently
reads this stored context; adding that is a later integration step.

## Backend enforcement

The globally registered `AgenticCmsGuard` protects every Nest HTTP controller
under `/agentic-cms`, applies the existing CMS authentication guard, and checks
pilot access before invoking its handler. Keep controllers inside the feature
folder with a literal `@Controller('agentic-cms/...')` prefix. Import the feature
module only from `AppModule`; share ordinary CMS services into the feature,
rather than importing AI services into existing CMS modules.

HTTP routes at `/agentic-cms/mcp` and `/agentic-cms/context` (including their
subpaths) use verified-only CMS authentication:
the global guard rejects email-only bearer credentials before identity resolution
and requires an active CMS user. Other CMS routes retain their current sign-in
behavior. This uses the existing Microsoft Graph token verifier; interoperable
remote MCP OAuth discovery/resource-token support is not implemented yet.

`CmsReadAccessService` supplies project-authorized workstream/deliverable query
scopes and individual-record checks. Read handlers must combine these scopes with
their filters using AND, including nested records, and recheck for each operation
or continuation. It preserves the existing differences between role-wide project
access and deliverable access; membership, ownership and draft visibility still
apply after pilot admission.

For jobs, streaming iterations and non-HTTP entry points, inject
`FeatureFlagsService` from `FeatureFlagsModule` and call:

```typescript
this.flags.assertAgenticCmsEnabledFor(user.email);
```

Check before queuing or starting work, before each new model/tool operation,
and immediately before posting document comments or other external writes.
Queued work must recheck when it runs. Do not make provider calls or start
workers/listeners in constructors, module imports or startup hooks. Standalone
MCP servers and WebSockets are not automatically covered by the HTTP guard;
they require an equivalent server-side gate and review before integration.

The Lumen variables are a configuration contract for Group 1; this flag scaffold
does not implement an LLM client, external search, MCP transport or editors.

## Required checks and PR review

Group 2's workstream and deliverable tool contracts are documented in
[MCP read-tool contracts](agentic-cms-mcp-contracts.md). This specification covers
inputs, outputs, pagination and inherited record permissions; it does not add a
running MCP endpoint.

PR Validation runs `scripts/check-agentic-boundaries.cjs` and its negative tests
inside the required **Backend typecheck, tests and build** check. It rejects
imports that bypass the feature boundary, misplaced Agentic CMS controllers,
AI/MCP SDKs outside the backend feature folder, frontend provider-key references,
and independent reads of the release switch. Backend HTTP tests cover default
off, authenticated on, pilot denial and blocked side effects. Context controller
and authorization tests cover project-scoped reads/writes, validation, role
denial, note creation/deletion and flag-off behavior. Browser tests cover gated
loading, failed flag requests, account changes and sign-out; the context browser
test covers separate tabs and role-dependent edit controls.

Run from the repository root after installing the locked backend/frontend
dependencies and generating their Prisma clients:

```sh
node scripts/check-agentic-boundaries.cjs
node --test scripts/check-agentic-boundaries.test.cjs
npm --prefix backend test -- --runInBand
npm --prefix frontend run test:navigation:browser
node --test frontend/tests/agentic-context-browser.test.cjs
```

For every Agentic CMS PR, record the scenario tested with the flag off and on.
Verify normal CMS pages still work with the flag off and that no AI side effect
runs. Keep shared CMS changes backward compatible. Static checks cannot infer
the purpose of arbitrary new code or prove worker cancellation: reviewers must
check new entry points, shared-page changes and before-write checks. Do not
weaken these checks or change the release defaults without Isaiah's review.

### MCP access evidence (Step 2)

`backend/src/agentic-cms/authorization/` contains unit and HTTP tests using synthetic
identities, a mocked token verifier and mocked Prisma queries. Flag-off cases
block verification, identity resolution and tool reads while an ordinary guarded
CMS route remains usable. Flag-on cases accept verified members and deny malformed
or email-only credentials, inactive users, non-pilot users and lost membership.
Tests cover all six roles, draft query filters, project-scoped child lookups and
generic denial responses. These are access-foundation tests, not live Microsoft
sign-in or end-to-end MCP tests; the production MCP endpoint comes in Step 4.
Authentication/global-guard changes require Isaiah's boundary review before integration.

Project-context HTTP security tests use the real Nest controller, global guard and
authorization service with synthetic identities and mocked verification/database
queries. They cover all four operations: flag-off blocking before authentication
or reads, verified active users, pilot denial, project membership and write roles,
project-scoped note deletion, and flag/pilot changes during requests. An ordinary
CMS route still accepts its existing credentials with the feature off. Context
handlers recheck the feature before writes and before returning fetched context.
These tests do not contact Microsoft Graph or a live database.


### Read-operation evidence (Step 3)

`CmsReadService` implements `listWorkstreams`, `getWorkstream`, `listDeliverables`
and `getDeliverable` with strict input/output schemas, authorized query scopes,
signed pagination, source metadata and explicit text truncation. Deliverable detail
sections expose assignments, subtasks and submission history/feedback. These are
internal methods; the MCP endpoint and registration are not implemented yet.

For local PostgreSQL integration tests, start Docker Desktop and run
`npm --prefix backend run test:integration` from the repository root. This manages
the dedicated database in `docker-compose.test.yml`; see the README for start,
status and stop commands. No temporary embedded PostgreSQL package is required.
CI supplies its own PostgreSQL service through `CMS_READ_TEST_DATABASE_URL`.
That variable also supports a manually managed local test database with the
ordinary backend test command; without it, integration tests are reported as
skipped while unit tests still run.
The suite rejects remote hosts, creates a uniquely named schema, applies committed
migration SQL, inserts synthetic fixtures and removes only its schema afterwards.
It verifies actual returned values, filtering/pagination, timezone boundaries,
versions/feedback, nested permissions, lost membership and flag-off blocking.
No production credentials, client materials or external model calls are used.

Local validation: 225 backend tests passed, including 14 PostgreSQL integration
cases; lint, typecheck, build, boundary checks and workflow validation passed.
Browser regression: 71/72 passed initially; the When2Meet 667x375 layout case
passed on a focused rerun. No frontend code changed in Step 3.
