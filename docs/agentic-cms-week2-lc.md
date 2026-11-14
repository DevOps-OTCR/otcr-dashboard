# Week 2 LC Report

Owner: Aritro
Deadline: Fri 2026-11-13 11:59 PM CT
Repo: otcr-dashboard
Status: in progress. Sections 4, 5, 6 open.

Scope: Week 2 review components, their connection points into the existing
Agentic CMS, and the staging state needed to demo them.

## 1 What landed

Week 1 PRs were reviewed and merged in order (#176, #178, #168, #183, #184),
with staging promotions #185 #186 #188 #191. The optional PM-interview PRs #166
#167 #172 #173 #174 #175 are merged and on staging. Week 2 group PRs are not
open yet.

| Order | PR | What | Merge commit | Notes |
| --- | --- | --- | --- | --- |
| 1 | #192 | client-call-summary skill | `3b31baa` | merged to main 2026-11-12. strict scorer 6/8, manual 8/8 on 4 fictional transcripts. on staging via #195 |
| 2 | #194 | move AGENTIC_CMS_ENABLED and AGENTIC_CMS_ALLOWED_EMAILS to Render dashboard control (sync: false) | `cb1c098` | merged by Isaiah into the staging branch |
| 3 | #195 | promotion of #192 main onto staging | `5aae3db` | merged 2026-11-13. staging API redeployed by hand on Render |
| draft | #193 | Slack-synced role suggestions, admin approves, never auto-grant | none | CI green. stays draft until Isaiah sign-off and one real-Slack staging check |

Why #195 needed a manual API redeploy: `buildFilter` does not include
`agentic-cms/**`, so a skill-only change on main does not trigger a staging API
redeploy. Aritro redeployed the staging API by hand on Render on 2026-11-13; the
API `__meta` reports `5aae3db`. The bot loaded client-call-summary on staging
during the demo.

## 2 Integration evidence

Checks that passed, from the Week 1 integration branch and the later PRs.

| Check | Result | Where |
| --- | --- | --- |
| `check-agentic-boundaries.cjs` and its test | passed, 5/5 | local |
| backend tests before last two commits | 34 suites, 644 tests | local |
| `tool-registry.spec.ts` | 10 passed | local |
| `cms-read.tools.spec.ts` | 4 passed, then 11 passed after #190 | local |
| backend `tsc --noEmit` | passed | local |
| frontend unit tests | 50/50, then 36/36 on calendar/PM-tools | local |
| frontend navigation browser tests | 87 pass, 2 fail | local |
| `agent.service.spec.ts` and `cms-read.tools.spec.ts` | 66 passed | local, before #189 |
| PR validation #190 | passed | CI |
| PR validation #187 | passed after matcher fix | CI |
| main push validation after #187 | passed | CI |

The two navigation browser failures are `tests/when2meet-browser.test.cjs`,
navbar clearance at 667x375 and 899x520. No when2meet file is in
`origin/main...HEAD` for that branch. The same failure reproduced on #178.

Staging smoke and deploy history:

| Build | Commit | Smoke | Result |
| --- | --- | --- | --- |
| #186 | `e7678e6` | red after deploy | waited for a URL matching `**/sign-in/**` while the browser was on `/sign-in`. fix is #187 |
| #188 | `751efc3` | passed, 2m32s | both services on the same commit, CORS preflight passed |
| #191 | `eb47780` | passed, 2m35s | frontend `__build.json` and API `__meta` match |

Flag-off verified:

| Check | Result | When |
| --- | --- | --- |
| `render.staging.yaml` sets `AGENTIC_CMS_ENABLED=false` | yes for #188 and #191. since #194 the yaml no longer sets it (`sync: false`, dashboard controls it) | #188, #191, #194 |
| signed-out `/agentic-cms/status` | 404 | on `e41f59a` |
| signed-out `/agentic-cms/status` | 401 after #191 | on `eb47780`. flag is on in the running service, guard requires verified sign-in |
| sign-in page shows "Sign in with NetID" | yes | all checks |
| sign-in page shows "OTCR Bot" | 0 times | all checks |
| unauthenticated `GET /feature-flags` | 403 | all checks |

Evidence screenshots and recordings (sign-in page, agent 404, build.json, the
flag-off recheck clip that asserts status 404 and zero "OTCR Bot") will be
attached to the PR.

A bare 404 from the guard means the flag is not `true`. A missing record keeps
`NOT_FOUND_OR_FORBIDDEN`. That mapping was reviewed and kept.

## 3 Staging config needed

Env var names only. Values never go in docs.

| Var | Who owns setting it | Notes |
| --- | --- | --- |
| `AGENTIC_CMS_ENABLED` | Isaiah | moved to Render dashboard control by #194 (`sync: false`). exact `true` enables |
| `AGENTIC_CMS_ALLOWED_EMAILS` | Isaiah | moved to Render dashboard control by #194. empty means every signed-in staging user is allowed |
| `LUMEN_API_KEY` | Isaiah | unknown whether set on `otcr-dashboard-staging-api` |
| `LUMEN_BASE_URL` | Isaiah | listed in `docs/agentic-cms.md` shared deployment config |
| `LUMEN_MODEL` | Isaiah | same |
| `TAVILY_API_KEY` | Isaiah | optional. `read_web_source` is not in this build, so search excerpts stay unverified leads |
| `OTCR_BOT_MAX_MESSAGES_PER_HOUR` | Isaiah | rate cap |

Production stays off. The pilot allowlist is set and includes Aritro's staging
account. Isaiah is the contact for that note.

## 4 Signed-in check and demo

Status: done 2026-11-13.

| Step | State |
| --- | --- |
| signed-in flag-on check | done 2026-11-13: signed in on staging as a consultant account on the allowlist, the OTCR Bot (pilot) button shows and the panel opens |
| fictional Prairie Basket demo | done. Isaiah moved Aritro to PM on staging; created the fictional project, saved overview/scope and one client note, ran research, slide outline and a fictional client-call summary in the bot |

Results:

- research prompt: read tools called, research skill loaded, refused to invent sources, offered skeleton with [DATA NEEDED] slots, used the client-note constraints
- slide outline: consulting-slides skill, placeholder numbers labelled illustrative
- client-call summary: client-call-summary skill loaded, confirms #192 is live on staging; one inconsistency: 'what happened' says the Friday offer was accepted while open questions mark it unclear

GIF and frames are in the PR description.

Found during the demo:

- the `/agentic-cms/` trailing-slash bug (`frontend/features/agentic-cms/index.tsx:150`, `frontend/components/AgenticCmsFeature.tsx:47`), owner Group 1
- after a role change, silent sign-in renewal failed until local site data was cleared and the user signed in again

No email addresses, keys, tokens, or URLs with credentials go in this section.

## 5 Week 2 components: connection points

Each point has an owner or a named next step.

| # | Point | Exists today | Missing | Owner |
| --- | --- | --- | --- | --- |
| 1 | Review skills into the skill loader | loader finds `agentic-cms/skills/<name>/SKILL.md`, appends `shared/` contracts, 64,000 char cap, `<tool_data>` wrapping, status lists skills | new folders vs variants of `whitepaper-writing` and `consulting-slides`, review-specific shared contract, fit the 64k budget, `buildFilter` skips `agentic-cms/**` so skill-only changes need manual redeploy | Teja, review Aritro. `buildFilter` to raise with Andrew (infra) |
| 2 | Advanced skills MCP context calls | five read-only tools over `CmsReadService`, in-process and at `/agentic-cms/mcp` | whether skills use the in-process path or MCP, no client-notes read beyond `get_project_context`, no full-source file reading | Teja for mapping, Stefan for new server-side work |
| 3 | Document mechanism as a new tool | `ToolRegistry` and `AgentTool` interface, all tools read-only today | no write or comment tool. design decision: native doc comments or CMS-side feedback with slide/section refs | Akshay and Satya propose, Aritro and Isaiah decide |
| 4 | Reviewer UI needs a review-job API | chat SSE, status, flag and pilot guard | no review-job API. need submit, level, poll or stream status, fetch feedback | likely Sriram and Stefan, to confirm |
| 5 | Revision/snapshot ID on feedback | `get_deliverable` returns submission history and feedback | Group 3 defines the ID, it must attach to each feedback item, Group 1 must display it | Akshay and Satya produce, Sriram and Stefan consume |
| 6 | Flag and permissions | `AGENTIC_CMS_ENABLED`, pilot allowlist, verified-only auth, project access checks, write role rules | same flag or a review flag, permission check for review endpoints and any write path | Isaiah for the flag call, review-job API owner for the check |

## 6 Open items

| Item | Owner | Due |
| --- | --- | --- |
| confirm `LUMEN_API_KEY` set on `otcr-dashboard-staging-api` | Isaiah | Sun 2026-11-15 |
| fix /agentic-cms/ trailing-slash check so the context editor shows on staging | Group 1 (Sriram, Stefan) | next week |
| client-call-summary: keep what happened consistent with open questions on unconfirmed acceptances | Aritro | next week |
| #193 sign-off and one real-Slack staging check | Isaiah | this week |
| decide native doc comments vs CMS refs for feedback | Aritro and Isaiah | after Group 3 proposal |
| decide review under existing flag or a separate one | Isaiah | after Group 1 and 3 PRs |
| confirm review-job API owner and shape | Sriram and Stefan, confirm with Akshay and Satya | after PRs open |
| confirm review skills as new folders or variants | Teja | after PR opens |
| Friday PR | Aritro | Fri 2026-11-13 11:59 PM CT |

Reviewer status: Lumen Gemma and DeepSeek ran, Nemotron returned empty output
twice. Codex ran on both. AGY is at HTTP 429, quota resets Fri 13 Nov about
9:07 PM CT, retry before the deadline. OpenCode model is not available on the
Bedrock account.
