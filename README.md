# QA assets: PM tools card + PM project-scoping fix (optional, from PM interview)

## 1. PM tools card (`pm-tools-qa.mp4`, `card-*.png`)
Playwright on the local browser harness (mocked API). Re-run from `frontend/`: `node pm-tools-qa.cjs <out-dir>`.
- `card-01-pm-sees-card.png`: PM sees "PM tools": Team One shows 1 overdue, 1 due this week, 1 unreleased sprint and the next deadline; Team Two "All clear".
- `card-02-consultant-no-card.png`: a consultant does not see the card.
- `card-03-lc-sees-card.png`: an LC sees the card.

## 2. Security fix: PMs are always scoped to their own projects (`pm-scope-qa.mp4`, `scope-*.png`)
Real run, not mocked: two NestJS API builds on the same local Postgres 16 seed. Port 4100 = `main`'s code, port 4101 = this PR.
- `scope-1`: **bug reproduced on main**: `pm1` calls `GET /projects?pmId=u-pm2` and receives pm2's projects.
- `scope-2`: with this PR the same call returns only pm1's project.
- `scope-3`: the normal PM listing is unchanged.
- `scope-4`: admins can still filter by PM.
- `scope-5`: consultants still see only their teams.
- `scope-6-summary.png`: all checks pass.
