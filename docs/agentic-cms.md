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
   - "Summarize my current workstream" → calls the mock CMS tool.
   - "Research the size of the US campus e-bike market, with sources" →
     web search with numbered citations and a Sources list.
   - "Write an executive summary of our findings so far" → loads the sample
     skill.
6. Check the configuration without calling a model (from a terminal, the
   existing auth guard's legacy `Bearer <email>` form works for a user in your
   local database):

   ```sh
   curl -H "Authorization: Bearer you@illinois.edu" http://localhost:4000/agentic-cms/status
   # {"enabled":true,"model":"deepseek-v4.1-flash","modelConfigured":true,
   #  "webSearchConfigured":true,"skills":["sample-executive-summary"]}
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
         ├─ OpenAICompatibleClient → Lumen /chat/completions (streaming, tools)
         ├─ ToolRegistry
         │    web_search              Tavily; results become numbered sources
         │    load_skill              agentic-cms/skills/<name>/SKILL.md
         │    get_workstream_summary  MOCK data until Group 2's MCP tools
         └─ ConversationStore   in memory (lost on restart) — history per user+project
```

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
| `{"type":"tool_start","id","name","label"}` / `{"type":"tool_end","id","ok","note?"}` | Tool progress for the UI |
| `{"type":"sources","sources":[{"id","title","url"}]}` | All sources so far, so `[id]` links work while streaming; the last event of a turn lists only the cited ones |
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
expected failure. Group 2's read-only MCP tools will replace
`get_workstream_summary` this way.

### Adding a skill

See [agentic-cms/skills/README.md](../agentic-cms/skills/README.md). The bot
sees each skill's name and description, and loads the full instructions with
`load_skill` when a request matches.

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
- `get_workstream_summary` returns mock data. Real project context arrives with
  Group 2's MCP tools.
- Source numbers restart with each answer.

## Where each group builds

| Group | Required integration boundary |
| --- | --- |
| 1: agent backend and sidebar | Add providers, orchestration and chat endpoints under `backend/src/agentic-cms/`; mount the bot from `frontend/features/agentic-cms/index.tsx`. |
| 2: context and MCP tools | Add new context endpoints under `/agentic-cms/context` and MCP under `/agentic-cms/mcp`. New upload controls belong inside the same frontend feature folder. Reuse existing CMS authorization/services for read tools. |
| 3: skills | Store instructions/resources under `agentic-cms/skills/`. The gated agent loads them on demand. Test synthetic examples locally with your own key. |

The protected `/agentic-cms/status` endpoint is a connection check, not a chat
implementation. `GET /feature-flags` returns only `{ "agenticCms": boolean }`
for the signed-in user, with no secrets or allowlist in the response. The
frontend has one lazy entry point, `components/AgenticCmsFeature.tsx`, mounted
in the application layout. Feature components and their effects must stay
inside it; do not mount a second sidebar or import feature code into existing
CMS pages. A failure or an older backend that lacks this endpoint keeps it off.

## Backend enforcement

The globally registered `AgenticCmsGuard` protects every Nest HTTP controller
under `/agentic-cms`, applies the existing CMS authentication guard, and checks
pilot access before invoking its handler. Keep controllers inside the feature
folder with a literal `@Controller('agentic-cms/...')` prefix. Import the feature
module only from `AppModule`; share ordinary CMS services into the feature,
rather than importing AI services into existing CMS modules.

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

OTCR Bot (chat, Lumen client, tool loop, web search, skill loading and a mock
CMS tool) is implemented; see "How OTCR Bot works". MCP transport, real CMS
context tools, persistent chat history, document review and editors are not.

## Required checks and PR review

PR Validation runs `scripts/check-agentic-boundaries.cjs` and its negative tests
inside the required **Backend typecheck, tests and build** check. It rejects
imports that bypass the feature boundary, misplaced Agentic CMS controllers,
AI/MCP SDKs outside the backend feature folder, frontend provider-key references,
and independent reads of the release switch. Backend HTTP tests cover default
off, authenticated on, pilot denial and blocked side effects. Browser tests
cover lazy loading, failed flag requests, account changes and sign-out.

Run from the repository root after installing the locked backend/frontend
dependencies and generating their Prisma clients:

```sh
node scripts/check-agentic-boundaries.cjs
node --test scripts/check-agentic-boundaries.test.cjs
npm --prefix backend test -- --runInBand
npm --prefix frontend run test:navigation:browser
```

For every Agentic CMS PR, record the scenario tested with the flag off and on.
Verify normal CMS pages still work with the flag off and that no AI side effect
runs. Keep shared CMS changes backward compatible. Static checks cannot infer
the purpose of arbitrary new code or prove worker cancellation: reviewers must
check new entry points, shared-page changes and before-write checks. Do not
weaken these checks or change the release defaults without Isaiah's review.
