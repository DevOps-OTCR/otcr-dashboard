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
