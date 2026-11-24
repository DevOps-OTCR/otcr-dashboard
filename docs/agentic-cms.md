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

A reply gets at most 6 model rounds. The last round offers no tools and, for that
call only, tells the model to answer from what it has gathered and say what it
couldn't check. A long, skill-guided research task therefore ends in an answer,
not a bare "stopped" notice.

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

## Research workspace foundation (Step 1)

Research is currently a CMS-native, plain-text document stored in PostgreSQL,
with one shared workspace per deliverable. This is the functional storage
fallback while Google Docs integration is being investigated. Relevant Past Data
now has the retrieval/generation workflow described in Step 4. General chat-based
research editing remains a later step. The manual research UI is described below. Existing
project-context editors and submission/approval flows are unchanged.

Apply the committed `20261124202640_research_workspace` migration to a local
development database using the README's `prisma migrate deploy` instructions,
and regenerate the backend Prisma client. No flag default or live configuration
change is necessary. The API remains unavailable unless the existing Agentic CMS
flag and pilot admission permit the signed-in user.

The HTTP base path is
`/agentic-cms/research/projects/:projectId/deliverables/:deliverableId`.
Every request uses the same verified Microsoft authentication/enrollment policy
as the other Agentic CMS endpoints. `ResearchAccessService` reuses CMS deliverable
scopes, preserving membership, project relationships and draft-week visibility.
Existing authorized readers can read research. Writes require an assigned
consultant (including the legacy `assigneeId`), an admin, an LC with project
access, or the project's owning PM. Assignment never overrides lost project
access. Read responses include `canEdit` for the future interface.

| Method / suffix | Behavior |
| --- | --- |
| `POST` base path | Explicitly initialize three empty root sections; repeat calls reuse the existing workspace without resetting content or adding history. Requires write access. |
| `GET` base path | Read saved content and current version; never creates a workspace implicitly. An authorized `WORKSPACE_NOT_INITIALIZED` error includes `canEdit` for the create button. |
| `PUT` base path | Save `{ expectedVersion, document }` as a new revision. |
| `PATCH /sections/:sectionId` | Save `{ expectedVersion, content?, title?, sourceIds? }` to one existing section without replacing other sections. |
| `GET /revisions?limit=20&beforeVersion=…` | List revision metadata newest first; continue with `nextBeforeVersion` until null. Maximum page size is 50. |
| `POST /restore` | Restore `{ expectedVersion, targetVersion }` as a new revision; earlier versions remain available. |

Workspace responses contain `id`, `deliverableId`, `projectId`, `storage: "cms"`,
`version`, `document`, `canEdit`, `createdAt` and `updatedAt`. A document has:

```json
{
  "schemaVersion": 1,
  "sections": [
    { "id": "past-data", "tab": "past-data", "title": "Relevant Past Data", "content": "", "sourceIds": [] },
    { "id": "framework", "tab": "framework", "title": "Framework / Structure", "content": "", "sourceIds": [] },
    { "id": "findings", "tab": "findings", "title": "Findings", "content": "", "sourceIds": [] }
  ],
  "sources": []
}
```

The three root IDs are stable even when titles change. Additional sections can
use distinct stable IDs and one of the three tab values. Array order is display
order; section identity must never depend on its title or index. Sources are
`{ id, title, url }` with HTTP(S) URLs. Each section's `sourceIds` must refer to
the document's stored source registry. Storage validates references but does not
claim to verify source content. Text is plain text; render it safely in the UI.
Documents allow up to 100 sections, 200 sources, 50,000 characters per section,
and 200,000 serialized characters overall; the server's HTTP body limit also
applies. IDs use letters, numbers, underscores or hyphens, up to 100 characters.

Initialization records version 1. Every successful save or restore commits both
the new document and a complete revision snapshot in one database transaction.
Revisions record author, timestamp, action (`INITIALIZE`, `EDIT`, `RESTORE`) and,
for restores, the original version. Sources are part of each snapshot and survive
restarts independently of the bot's in-memory chat history. Versions and history
belong to this research workspace, not the deliverable's submission versions.

Send the last-read version as `expectedVersion` on every edit/restore. A stale
request returns HTTP 409 / `VERSION_CONFLICT`, with no changes committed; reload
and reconcile rather than blindly retrying. Restore replaces the **whole research
document**, including its sources, and creates a new version. It does not erase
history, alter submissions, or automatically approve work. A later UI should
make the scope of restore clear when multiple consultants share a workspace.

Uninitialized workspaces return 404 / `WORKSPACE_NOT_INITIALIZED`; unknown
sections/revisions return 404; invalid payloads return 400 / `INVALID_ARGUMENT`.
Unauthorized or mismatched parent records return a generic 404 without reading
research content. Access is checked again before writes and before returning
content/history. Storage lives behind `ResearchDocumentAdapter`, implemented by
`CmsResearchDocumentAdapter`. A future Google Docs adapter must preserve these
permissions, conflict checks and durable history; adding a URL alone does not
connect synchronization.

Validation: `research-workspace.http.spec.ts` uses the actual module/global guard
with synthetic authentication and mocked storage. It covers flag-off/default-off
and flag-on operation, ordinary CMS availability, malformed tokens, enrollment,
pilot admission, assigned/read-only users, manager roles and mid-request access
changes. `research-workspace.integration.spec.ts` applies committed migrations to
an isolated local PostgreSQL schema and checks shared initialization, persistence,
source snapshots, concurrent saves, rollback, restore and real permission scopes.
Run `npm --prefix backend run test:integration` to include it in the dedicated
local test database suite. No model, Google API or real client material is used.

### Manual research UI (Step 2)

Run the frontend and backend using the README's local development instructions,
with the research migration applied. Enable the existing backend flag and limit
the pilot allowlist to your account locally. Keep the checked-in flag default
off. No model key is needed to use the manual research workspace. Sign in with
your normal enrolled Microsoft account and open `/agentic-cms`, then choose
**Research**, a project, a workstream and a deliverable within that workstream.
The two research dropdowns group by workstream ID, default to the newest available
workstream, and retain standalone deliverables under **No workstream**. Only
workstreams with visible deliverables appear. Project selection is shared with the
existing context panels. Selecting a deliverable reads its workspace without
creating anything automatically. If it is missing, the server's `canEdit`
response determines whether **Create research workspace** is offered. Other
404s and connection failures show a retry state instead of offering creation.

The three research tabs support manual titles and plain-text content. The
interface displays saved version, last-save time and unsaved status; **Save
research** saves the complete draft across all three tabs. Stored sources are
rendered as links beside their associated section. Relevant Past Data retrieval
is described in Step 4. Automatic framework headings, adding/removing framework
sections and general bot edits arrive in later steps. Saved documents remain CMS-native until an external adapter is
connected.

Switching research tabs or existing Agentic CMS tool tabs preserves the draft.
Switching projects/workstreams/deliverables or reloading saved research asks before discarding
unsaved text; closing/reloading the browser uses the native unsaved-changes
warning. Drafts are held in memory, not local storage. Navigate away only after
saving: internal navigation away from the Agentic CMS page unmounts its editor.
Save failures retain the draft. A version conflict keeps it visible and disables
further saves until the user copies anything needed and explicitly reloads the
latest document. No automatic overwrite or conflict merge is attempted.

**Version history** loads revision metadata in pages. Restoring requires an
explicit confirmation explaining that all three tabs and sources will be
replaced; it creates a new version. Restore is disabled while a draft is unsaved.
Read-only users can view research/history but cannot create, save or restore.
Late read/write responses from a previous selection are ignored. Sign-out,
account change or feature revocation unmounts the gated feature and clears its
in-memory drafts.

`frontend/tests/agentic-research-browser.test.cjs` uses the real gated feature,
editor and API client with synthetic sign-in/API responses. It covers flag-off
blocking before project/research reads, flag-on creation/edit/save/reload,
permissions, pagination, retries, conflicts, restoration, draft protection,
late responses, sign-out/revocation, source links and narrow-screen layout.
It runs as part of `npm --prefix frontend run test:navigation:browser`; it does
not verify live Microsoft sign-in or Google Docs.

### Research initialization on release (Step 3)

Successful calls to the existing `PATCH /projects/:id/sprints/:sprintId/status`
with `status: "RELEASED"` now initialize research for each deliverable in that
project/week. The `ResearchReleaseInterceptor`, registered from AgenticCmsModule,
observes that exact controller handler after it succeeds. Shared CMS controllers,
pages and release services do not import feature code. Draft changes and failed
release requests do not start preparation.

The hook checks the existing flag/pilot before any research operation, then reuses
`AuthGuard.canActivate(context, { verifiedOnly: true })`: the same verified-only
Microsoft token, enrollment and active-user policy used by Agentic CMS routes.
Legacy email credentials can still release an ordinary week, but cannot start
research. Non-pilot users and users without project/deliverable access cannot
prepare research. The ordinary release result and notifications stay independent:
disabled/denied/failed preparation does not fail a successful release. This
non-prefix entry point needs Isaiah's boundary review before integration.

Apply migration `20261124210930_research_preparation` and regenerate Prisma before
running the updated backend. `ResearchPreparation` stores one status record per
deliverable, attempts, timestamps, a generic failure code and a two-minute claim
lease. It stores no bearer tokens, prompts or client content. Atomic claims and
the workspace's unique deliverable key prevent duplicate initialization. Each
workspace and its first revision are still created together; repeated releases,
retries or manual initialization preserve existing text, sources and history.

Workspace preparation creates the three blank sections and runs inline after
release. Step 4 then queues optional Relevant Past Data generation separately;
the release response does not await the model. There is no startup worker,
scheduler or automatic retry. Existing
released weeks are not backfilled at startup. Releasing a week again prepares
missing workspaces. A newly added deliverable after release needs manual creation,
a preparation retry, or another release request.

Project access, assignment/manager write permission, pilot access and the week's
released status are rechecked before initialization and status writes. Changing
the flag, membership or week back to draft stops further preparation writes. A
claim left by interrupted work becomes retryable after two minutes; old claim
owners cannot overwrite the new claim's status. Durable status is recoverable
through the APIs below, not by resuming background work automatically.

| Method / suffix on the existing research base path | Behavior |
| --- | --- |
| `GET /preparation` | Return `state`, `attempts`, timestamps, `interrupted`, generic `message` and server-calculated `canRetry`. |
| `POST /preparation/retry` | Retry initialization for an authorized editor of a released deliverable; return the current preparation status. |

States are `NOT_STARTED`, `PENDING`, `PREPARING`, `READY` and `FAILED`. An existing
workspace is authoritative for `READY`, including manually created research or a
successful initialization whose final status write failed. An active lease cannot
be claimed by another retry. Failures after a claim are recorded when access and
storage allow it; loss of access leaves the lease untouched for later recovery.
If storage fails before a status record can be created, the UI may show not
started or a status-read error rather than a recorded failure.

The Research tab shows workspace preparation status and an authorized retry
button for failed, pending or interrupted work. It polls only active preparation,
stops on unmount/revocation, and opens newly prepared research without replacing
an existing editor draft. Manual creation remains available for older workspaces
and permitted draft deliverables.

Validation includes the real release controller, global guard and interceptor
with synthetic verification, plus PostgreSQL integration cases for actual
release-to-workspace creation with the flag off/on. Tests cover independent
release success, legacy-credential exclusion, revoked enrollment/pilot, role
denial, concurrent initialization, failure/retry, active/expired claims,
preserving saved research and mid-operation access changes. Browser tests cover
status display, retry, polling and read-only access. No live model or external
document operation is used.

### Relevant Past Data first pass (Step 4)

The dedicated workflow uses the existing OTCR Bot `MODEL_CLIENT` and on-demand
`relevant-past-data` skill. It performs retrieval before generation rather than
running a free-form chat/tool loop. There is no vector index, embedding service,
web search, linked-file reader or Google Docs dependency in this pass.

The input is the selected deliverable title/brief, workstream notes, project
overview/scope, and an optional consultant focus (maximum 1000 characters).
Retrieval stays within the current project. It considers:

- Project overview and scope, plus the 60 most recent available pasted call notes.
- Notes from up to 20 earlier **released** workstreams.
- Up to 60 deliverables in earlier released workstreams: assignment descriptions,
  up to three recorded feedback entries each, and saved Framework/Findings text.
- No current/future workstream outputs, unreleased workstreams, linked submission
  contents or recursively copied Past Data summaries.

Keyword overlap with the assignment and optional focus ranks candidates, with
extra weight for focus terms and project constraints retained. Up to 24 source
excerpts of 2400 characters each reach the model. These are candidate leads:
the model can reject irrelevant material or return zero items. The preview and
saved diagnostics expose counts, query terms and whether limits were reached;
this is explicitly not exhaustive semantic search. Limits and stopwords live in
`past-data-retrieval.service.ts`, not a browser switch.

The skill distinguishes client decisions from assumptions, prior assignment
briefs and preliminary findings. Model output is bounded JSON containing at
most eight source-linked items and six gaps. Every item must name a supplied
source ID and quote a continuous verbatim substring of its supplied text. The
backend rejects fabricated IDs, duplicate IDs, invented quotations, malformed
JSON and tool calls. This validates traceability, not the truth or entailment of
every paraphrase: consultants must still review summaries against their sources.
Sparse results explicitly state that little history was found in the searched
records. The input is wrapped as untrusted `<tool_data>`; only the repository
skill is passed as instructions.

Generation is auto-scheduled after release prepares each workspace, only if its
Past Data is blank and it has never had a generation record. Repeat releases
do not regenerate existing results or overwrite manual past data. Existing
released workstreams can use the manual button. No model call runs while the
release flag is off, pilot access is denied, enrollment is revoked, the actor is
inactive, project/assignment access is lost or the target workstream is not
released. Actor permissions and original sources are rechecked after generation
and before saving. Changed sources/assignment or a changed workspace version
cause a conflict instead of overwriting work.

`ResearchPastData` stores durable status, focus, attempts, request token, base
workspace version, last successful result and retrieval diagnostics. New work
starts only from an authorized release/action; a single in-process drain limits
model concurrency to one per backend instance, with a 45-second model timeout
and two-minute running lease. There is no restart-time worker. Interrupted queued
requests become manually retryable after 30 seconds; interrupted running work
after lease expiry. A new request token invalidates superseded requests. Missing
Lumen configuration creates a clear failure, never a fake summary, and does not
block manual editing or source preview. The queue is a prototype, not a
distributed job processor; restarting the backend can require a manual retry.

Successful output changes only the `past-data` root section and its source
registry. Framework/Findings and extra manual sections remain intact. The new
workspace revision and successful generation status commit in one transaction.
Refresh confirms replacement of saved past data, is disabled with unsaved edits,
and remains undoable through Version history. Failed runs keep the previous
document/result. The UI never replaces an unsaved draft when a newer bot save
arrives; it tells the consultant to copy needed text and reload explicitly.

| Method / suffix on the research base path | Behavior |
| --- | --- |
| `GET /past-data` | Current generation status, configuration availability and last successful result; read-only viewers cannot generate. |
| `POST /past-data/preview` | `{ focus? }`: retrieve authorized candidate sources without a model call or document write. Requires edit access and a released target. |
| `POST /past-data/generate` | `{ focus?, expectedVersion }`: queue a version-checked generation/refresh and return status. |
| `GET /past-data/source?kind=…&recordId=…` | Read a bounded current source excerpt with fresh project, record and release checks. |

Source links open the gated `/agentic-cms` source viewer using project,
deliverable, source kind and record IDs. They never put bearer tokens or client
text in the URL. The viewer shows the current source/date, explicitly warns that
an earlier summary may refer to an older version, and denies deleted, moved,
unreleased or inaccessible source records. A source link is not a claim that a
linked native document was read.

Apply migration `20261124214831_research_past_data` and regenerate the backend
Prisma client before running this step. Continue to use your own Lumen key in
the backend's ignored local environment. No new provider/release switch is added.

#### Local test and tuning walkthrough

1. Add two synthetic Client Call Notes in the same project: one clear relevant
   decision (e.g. “Exclude enterprise buyers because rollout exceeds budget”),
   and one irrelevant note (e.g. lunch logistics). Add useful Findings to an
   earlier released deliverable if you want to test research reuse.
2. Choose a later released workstream and deliverable in Research. Click
   **Preview sources**. Check that relevant notes/history appear, foreign or
   unreleased records do not, and **Open source record** shows the original text.
   This works without a model key.
3. Configure your own `LUMEN_API_KEY` locally and restart the backend if needed.
   Click **Generate past data**, or release a new draft workstream to test the
   automatic path. Model errors should be visible without affecting release.
4. Review the saved summary: does it retain the relevant decision, explain its
   effect on the assignment, avoid irrelevant notes, and quote/link real sources?
   Open **Last bot retrieval** to inspect the focus, model, source count and limits.
5. Try a focus such as “Prior client constraints and rejected customer segments”.
   Preview again, then refresh. Compare the result and use Version history to
   undo. Clear focus to test the assignment-only baseline.
6. Improve the brief/workstream notes first. If good sources are retrieved but
   summarized poorly, edit `agentic-cms/skills/relevant-past-data/SKILL.md` and
   rerun (skills load on demand). If sources are missing from preview, inspect
   dates/release state, keywords and `PAST_DATA_LIMITS`; backend code changes
   require a rebuild/restart. Keep a small before/after example rather than
   increasing retrieval limits blindly.

Tests use a counting fake model only inside test files and synthetic PostgreSQL
schemas. Coverage includes source isolation, flag-off blocking, enrollment,
permissions, output/citation validation, sparse history, injection markers,
conflicts, revoked access, status/save atomicity, automatic scheduling and repeat
release behavior. HTTP tests exercise the existing global guard. Browser tests
cover preview/source links, missing configuration, generation and draft safety.
Run the same backend/integration/browser commands documented above. No live model
quality evaluation or production/client-material upload is performed by tests.

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
for independent clients. When a result contains timestamps, the bot adds a
`localTimes` field to its JSON: with the project's timezone (the workstream tools
return it) the server converts each deadline and other instant itself, because the
model's own conversions used the wrong daylight-saving offset; without it the times
are marked UTC. `weekStartDate`/`weekEndDate` are calendar dates and are never
converted. A page of 50 deliverables fits in the map, and a workstream list that has only week dates still gets the calendar-date note. Skills loaded are research, whitepaper-writing and
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
