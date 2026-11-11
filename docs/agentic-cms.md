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

## Run OTCR Bot locally

1. Create a Lumen API key at <https://lumen.ncsa.illinois.edu> (Profile → API
   Keys). Open the model list in Lumen and acknowledge the notice for the
   configured model (DeepSeek models require it). Otherwise every reply fails
   with "must accept this model's notice".
2. Optional: create a free Tavily key at <https://app.tavily.com> for web
   search. Without it, the bot works but has no `web_search` tool.
3. Set up the backend and frontend as in the README. Then copy the Agentic CMS
   lines from [`backend/.env.example`](../backend/.env.example) into
   `backend/.env`, enable the flag and limit it to yourself:

   ```dotenv
   AGENTIC_CMS_ENABLED=true
   AGENTIC_CMS_ALLOWED_EMAILS=you@illinois.edu
   LUMEN_API_KEY=<your own Lumen key>
   TAVILY_API_KEY=<your own Tavily key, optional>
   ```

   `backend/.env` is ignored by Git. Never put a key in `env/env.example`,
   frontend code, a `NEXT_PUBLIC_` variable, a PR, a screenshot or Slack.
   If a key is ever committed, revoke it immediately: deleting the line does
   not remove it from Git history.
4. Start the backend (`npm --prefix backend run start:dev`) and the frontend
   (`npm --prefix frontend run dev`). Restart the backend after editing `.env`.
5. Sign in. An **OTCR Bot** button appears at the bottom right within 30
   seconds. Choose a project and workstream, then try:
   - "Summarize my current workstream" → calls the CMS read tools for the selected project.
   - "Research the size of the US campus e-bike market, with sources" →
     web search with numbered citations and a Sources list.
   - "Write an executive summary of our findings so far" → loads whitepaper-writing.
6. Check the configuration without calling a model. `/agentic-cms/status`
   requires a verified Microsoft token, an active enrollment, and pilot access.
   An email-only bearer is rejected before any model call. A permitted response
   looks like:

   ```json
   {"enabled":true,"model":"deepseek-v4.1-flash","modelConfigured":true,"webSearchConfigured":true,"skills":["consulting-slides","research","whitepaper-writing"]}
   ```

7. Test the flag. Set `AGENTIC_CMS_ENABLED=false` (or remove your email from
   the allowlist) and restart. The button disappears within 30 seconds,
   `/agentic-cms/*` returns 404, and Lumen usage (`GET /v1/usage`) does not
   increase. Normal CMS pages keep working.

## How OTCR Bot works

```
OtcrBot sidebar (frontend/features/agentic-cms)
  └─ POST /agentic-cms/chat  (Server-Sent Events)
       ChatController   flag + sign-in + pilot (global guard), project access
       AgentService     loop: model → tools → model, max 6 rounds, flag rechecked
                        before every model and tool call, per-user hourly limit
         ├─ OpenAICompatibleClient → OpenAI SDK → Lumen /chat/completions (streaming, tools)
         ├─ ToolRegistry
         │    web_search              Tavily; results become numbered sources
         │    load_skill              agentic-cms/skills/<name>/SKILL.md
         │    get_project_context, list_workstreams, get_workstream,
         │    list_deliverables, get_deliverable   CmsReadService, selected project
         └─ ConversationStore   in memory (lost on restart) — history and source
                                numbers per user+project+workstream
```

Tool results reach the model in two marked forms (`tools/tool-content.ts`).
Skills loaded by `load_skill` arrive inside `<otcr_skill>` tags as OTCR's own
instructions, which the model follows. Everything else (web results, CMS
records, any future tool) arrives inside `<tool_data>` tags as data, never
instructions. Text inside either block can't open or close these tags. The
system prompt says a skill can't override it or grant access to data. Only a
tool with `returnsInstructions` set is passed through; this is a boundary
setting, so don't set it on a tool that returns external or user-written text.

A conversation belongs to one user, project and workstream ("no workstream"
counts as its own). Reusing its id with a different one returns "conversation
not found", so the sidebar starts a new chat when either selection changes.

If the user's message states one word limit ("a 350-word summary") and the
finished draft's body is over it, the backend cuts it automatically, aiming just
under the limit. It retries once if the cut is still over or below 80% of the
limit. The count excludes headings, citation and claim tags, and the reviewer note
below the last `---` line. If the draft is still over, or the cut fails, the reply
says so.
Limits are read only from the current message, so a limit from an earlier message
or a skill's own default isn't enforced.

### Chat API

`POST /agentic-cms/chat` with the user's CMS token:

```json
{ "projectId": "…", "sprintId": "… (optional)", "conversationId": "… (optional)", "message": "…" }
```

The user must have access to `projectId` (same rules as the projects pages);
otherwise the response is a plain 403 before any model call. The reply is a
`text/event-stream` of `data: <json>` events, always ending with `done`:

| Event | Meaning |
| --- | --- |
| `{"type":"conversation","id"}` | Send this id back as `conversationId` to continue the chat |
| `{"type":"text_delta","text"}` | Next piece of the answer |
| `{"type":"text_replace","text"}` | Replaces this reply's text so far (sent after a word-limit cut) |
| `{"type":"tool_start","id","name","label"}` / `{"type":"tool_end","id","ok","note?"}` | Tool progress for the UI |
| `{"type":"sources","sources":[{"id","title","url"}]}` | Sources found so far this turn, so `[id]` links work while streaming; the last event of a turn lists only the cited ones, including any from earlier turns. An `id` means the same URL for the whole conversation |
| `{"type":"error","kind","retryable","message"}` | A user-safe error (see below) |
| `{"type":"done"}` | End of the reply |

Error `kind`s: `config` (server setting such as a missing/rejected key, model
notice not accepted, wrong `LUMEN_MODEL` — an admin must fix it), `rate_limit`
(Lumen busy, budget used up, or the user's hourly limit), `model` (Lumen down
or timed out — retry), `disabled` (flag switched off), `internal`. A failed
tool or search does not end the reply: the tool reports `ok: false` with a
note, and the model is told to explain the failure. Logs contain only error
classes and HTTP statuses — never keys, prompts, queries or replies.

### Adding a tool

Implement `AgentTool` (`backend/src/agentic-cms/tools/tool.types.ts`): a
name, a description saying when to use it, a zod `input` schema (also sent to
the model as JSON Schema), a progress `label`, and `run(input, ctx)`. Register
it in `AgenticCmsModule` and `ToolRegistry`. Tools must read the project from
`ctx.projectId`/`ctx.sprintId` — already access-checked — and never accept a
project id from the model. Throw `ToolFailure(note, modelMessage)` for an
expected failure. The five CMS read tools are registered this way over CmsReadService.

### Adding a skill

See [agentic-cms/skills/README.md](../agentic-cms/skills/README.md). The bot
sees each skill's name and description, and loads the full instructions with
`load_skill` when a request matches.

A skill can list the shared contracts it needs in its front matter, for example
`shared: evidence-format` or `shared: [evidence-format, otcr-quality-standards]`.
`load_skill` then adds `agentic-cms/skills/shared/<name>.md` after the skill, each
as its own `<otcr_skill>` block. A skill and its contracts must fit in 64,000
characters. A contract that is missing, misnamed or over that budget is left out,
and the skill's block says which. `shared/`, `references/` and `examples/` are
never loaded unless a skill lists them this way.

### Shared deployment configuration

The agent runs inside the existing NestJS backend service, so there is no
separate service. Set these on that backend's Render Environment settings
(staging: `otcr-dashboard-staging-api`) and redeploy:

| Variable | Value |
| --- | --- |
| `LUMEN_API_KEY` | Isaiah's key (secret; enter it only in Render) |
| `LUMEN_BASE_URL` | `https://lumen.ncsa.illinois.edu/v1` (the default if unset) |
| `LUMEN_MODEL` | `deepseek-v4.1-flash` (the default if unset) |
| `TAVILY_API_KEY` | Shared Tavily key for web search (secret; optional) |
| `OTCR_BOT_MAX_MESSAGES_PER_HOUR` | Per-user limit, default `60` |
| `AGENTIC_CMS_ALLOWED_EMAILS` | Pilot emails, comma-separated |
| `AGENTIC_CMS_ENABLED` | `true` only when the pilot starts; otherwise `false` |

The Lumen account behind `LUMEN_API_KEY` must have acknowledged the model's
notice. Verify the deployment with `GET /agentic-cms/status` as a pilot user:
`modelConfigured` should be `true`, and `skills` should list the skills.

The backend looks for skills at `<repo>/agentic-cms/skills/`. After deploying,
check that `/agentic-cms/status` lists the skills: if it is empty, the service
cannot see files outside `backend/`, so set `AGENTIC_CMS_SKILLS_DIR` or copy
the folder in during the build. Two further caveats need review before a pilot: the staging Blueprint's `buildFilter` does not include
`agentic-cms/**`, so skill-only changes do not trigger a redeploy; and
`backend/Dockerfile.prod` copies only `backend/`, so a Docker deployment needs
the skills folder copied in (or `AGENTIC_CMS_SKILLS_DIR` pointed at it).

### Known limitations (Week 1 prototype)

- Conversation history is in memory: lost on restart and not shared between
  server instances. The per-user hourly limit resets with it.
- Search excerpts are unverified leads. There is no full-page `read_web_source` yet.
- Week 2 review UI, review skills, and native document comments are not connected.

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
uses the backend's `canEdit` response for the selected project. Write endpoints
check permissions again on each request. Users without
accessible projects do not see the context tabs. The read-only MCP tool
`get_project_context` returns overview, scope and paginated call notes under the
same project access rules. It does not fetch linked files.

## Backend enforcement

The globally registered `AgenticCmsGuard` protects every Nest HTTP controller
under `/agentic-cms`, applies the existing CMS authentication guard, and checks
pilot access before invoking its handler. Keep controllers inside the feature
folder with a literal `@Controller('agentic-cms/...')` prefix. Import the feature
module only from `AppModule`; share ordinary CMS services into the feature,
rather than importing AI services into existing CMS modules.

Every HTTP route under `/agentic-cms` (context, MCP, status, chat and future
handlers) uses one verified-only CMS authentication policy in the global guard.
After the flag-off check, it rejects email-only or malformed bearer credentials
before identity resolution, verifies the Microsoft Graph token with the existing
verifier, requires active CMS email enrollment (`AllowedEmail`) before looking up
or creating a user, and requires an active CMS user. Enrollment can be revoked
while the `User` row stays active. The pilot allowlist is checked afterwards.
Group 1 consumes this boundary and must not add a second authentication policy.
Ordinary CMS routes outside the prefix keep their current sign-in behavior.
Interoperable remote MCP OAuth discovery/resource-token support is not
implemented yet.

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

OTCR Bot calls CmsReadService in-process for get_project_context, list_workstreams,
get_workstream, list_deliverables and get_deliverable. The MCP HTTP endpoint remains
for independent clients. Skills loaded are research, whitepaper-writing and
consulting-slides. Web search citations are live when a search key is configured.
Full-source web reading, persistent chat history, document review and editors are not.

## Required checks and PR review

Group 2's five tools are documented in [MCP read-tool contracts](agentic-cms-mcp-contracts.md).
See [MCP connection and usage](agentic-cms-mcp.md) for authentication, an SDK client,
captured synthetic responses and current limitations.

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
generic denial responses. These access-foundation tests do not perform live
Microsoft sign-in; separate integration tests exercise the MCP endpoint.
Authentication/global-guard changes require Isaiah's boundary review before integration.

Project-context HTTP security tests use the real Nest controller, global guard and
authorization service with synthetic identities and mocked verification/database
queries. They cover all four operations: flag-off blocking before authentication
or reads, verified active users, pilot denial, project membership and write roles,
project-scoped note deletion, and flag/pilot changes during requests. An ordinary
CMS route still accepts its existing credentials with the feature off. Context
handlers recheck the feature before writes and before returning fetched context.
These tests do not contact Microsoft Graph or a live database.

`agentic-cms-auth.http.spec.ts` runs the real global guard, `AuthGuard` and
`AuthService` with only Graph verification mocked, against `/agentic-cms/status`
and OTCR Bot's real `POST /agentic-cms/chat`, with a counting fake model. Every
rejected caller causes no project check, model call or tool call. It covers flag-off rejection
before verification, email-only/malformed/invalid credentials, unenrolled
identities (no user row is created), revoked enrollment, inactive users, pilot
exclusion and an accepted enrolled pilot user.

The context browser test also covers a failed save and a failed note add on the
current project: drafts stay on screen, Retry resends the same text, and the
saved values survive reload.

### Read-operation evidence (Step 3)

`CmsReadService` implements `getProjectContext`, `listWorkstreams`, `getWorkstream`,
`listDeliverables` and `getDeliverable` with strict input/output schemas, authorized query scopes,
signed pagination, source metadata and explicit text truncation. Deliverable detail
sections expose assignments, subtasks and submission history/feedback. All five
operations are registered as read-only tools at `/agentic-cms/mcp`.

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

The official client verifies discovery, calls, pagination and denials, including
context HTTP writes followed by MCP reads and denial after CMS enrollment is
revoked. The context browser suite covers save/reload, project switching during
reads and writes, note creation/deletion, and project-specific edit controls.
Browser fixtures use synthetic sign-in. Record current validation results in the PR.
