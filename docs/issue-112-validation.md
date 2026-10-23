# Issue #112 — validation

Prepared October 21, 2026 against main `87d57768bda8cec92369486f625b78d231b8bcad`.

## What this patch fixes

Previously, several backend paths accepted an email string as a credential. The auth service could also create a CONSULTANT profile for an identity with no approval record. Separately, People and team selection used different indicators of access.

The patch verifies Microsoft credentials, checks current approval/profile activity on every protected request, and uses one access policy for the API, People status and team eligibility. Administrator approval/direct grants write the role, active User and active approval together. Profile sync cannot change another identity or link a client-supplied provider ID.

The verified person can read their own minimal request/access state without entering CMS. The health endpoint remains public. Old Slack connection states from the email-only authentication path must be restarted, and callbacks recheck current approval/role.

## Demonstrated results

These are passing assertions against synthetic fixtures and the actual Nest route pipeline, with Microsoft and Prisma boundaries replaced by test doubles. They are not production account tests.

| Scenario | Observed test result |
| --- | --- |
| Plain email supplied as a bearer credential | 401; no User lookup/provisioning |
| Invalid Microsoft token, rejected Microsoft response or wrong identity domain | 401; no fallback credential |
| Verified but never requested / pending / rejected | Own status readable; protected API denied with CMS_ACCESS_DENIED; no User provisioned |
| Inactive profile or revoked grant | Protected API denied, even with the same previously accepted token |
| Approved consultant, PM, LC, partner, executive or admin | Correct granted role preserved across repeated sign-ins |
| Administrator approves or directly grants access | Consistent active User, approval and role in one transaction |
| User write fails during approval/grant | Transaction failure propagates; synthetic rollback checks retain pre-operation state |
| User changes profile-sync email/provider ID | Cannot modify or link another account |
| Active profile without approval | People separates profile activity from approval; team picker excludes it |
| Inactive profile with an active grant | Profile/approval shown separately; team picker and manual member assignment reject it |
| Approved identity added to a team | Accepted, including legacy approved identities needing profile provisioning |
| Request tries to select someone else's status | Status remains caller-only; legacy check-email rejects mismatches |
| Health check without authentication | 200; protected routes still reject anonymous requests |
| Revoked access during Slack connection flow | Callback denied before token exchange; old unverified states rejected |

## Automated verification

- **200 tests passed across 11 suites**, including 72 new tests covering access policy, route responses, identity verification and Slack state handling.
- Backend TypeScript check passed.
- Nest production build passed.
- Backend ESLint passed; obsolete suppressions removed, no new suppressions added.
- Dependencies installed from the existing lockfile, using locally cached package archives. No dependency or schema migration changes.

Commands, from `backend/`, using Node 24.19.0:

```sh
CMS_TEST_IN_PROCESS=1 npm test -- --runInBand
npm test -- --runInBand
npx tsc --noEmit --incremental false
npm run build
npm run lint
```

The initial sandbox forbade opening local listening ports. `CMS_TEST_IN_PROCESS=1` exercises the same Nest/Express routes, guards and JSON body middleware using Node request/response streams without a port. After terminal permissions were enabled, all 200 tests across 11 suites also passed without that flag, including the HTTP suites using real loopback servers. CI uses this default real-server mode.

Tests use Prisma fixtures to check decisions, writes and transaction boundaries; they do not claim a live PostgreSQL transaction/concurrency test. Microsoft responses are mocked; no real account was signed in during this task.

## Remaining integration work

The proposed response contract is in [access-approval-contract.md](access-approval-contract.md). Frontend-owner agreement is pending.

At the time of review, PR #121 head `9f07bb8daf30a6000a8430581291470b01012fa6` still treats ADMIN as approved and every other role as denied. It must use `hasCmsAccess`, accurate request/access states, and approval-aware UI gating. Coordinate additive People fields with #110 and cache clearing with #100.

Before parent #111 is closed or paired changes deploy:

1. Frontend owner agrees the contract and updates the frontend.
2. Check both changes together, including approved non-admins and revocation with cached pages.
3. An administrator reviews the [reconciliation proposal](access-reconciliation-proposal.md), confirms administrator access and separately approves any existing-record corrections.
4. Run normal CI checks and the intended deployment's Microsoft sign-in validation. Local loopback checks passed before publication.

No deployment, live account reconciliation or production record change was performed during validation.
