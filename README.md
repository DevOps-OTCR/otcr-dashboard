# QA assets: GET /projects/schedule batch endpoint (optional, from PM interview)

Real run, not mocked: the PR's NestJS API (`node dist/main.js`, port 4100) against a throwaway local Postgres 16 with all Prisma migrations applied and a small seed (6 users, one per role; 3 projects; one draft sprint). Local auth uses `Authorization: Bearer <email>`. 8 steps, 34 checks, 0 failures.

| File | What it proves |
|---|---|
| 01–05 | Each role (consultant, PM 1, PM 2, executive, admin) gets exactly the projects it should; `canManage` matches the deadline rule; the draft sprint's deliverable only reaches its PM and admins; no `pmId` leaks |
| 6-validation.png | Bad dates, inverted range, >62-day range → 400; no auth → 403 |
| 7-deadline-permission.png | Consultant PATCH deadline → 403; PM → 200; new deadline visible in the schedule |
| 8-restore-seed.png | Seed restored |
| 99-summary.png | 34 pass / 0 fail |
| schedule-endpoint-qa.mp4 | Full recording |
| schedule-endpoint-qa.cjs | The recorder |
