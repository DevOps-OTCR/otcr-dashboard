# CMS approval contract — #112 / #113 / #110 / #100

Status: proposal pending frontend-owner agreement. Baseline: main `87d57768bda8cec92369486f625b78d231b8bcad`.

## Authentication and approval

All protected backend routes require a Microsoft Graph access token in `Authorization: Bearer <token>`. Microsoft validates the identity; the backend then reads current access records on every request. Email-only bearer headers, arbitrary provider IDs and cached frontend roles are not credentials.

`AllowedEmail.active` is the approval authority. An explicit active administrator grant works without an onboarding request and takes precedence over an older pending/rejected request. An existing inactive User still blocks access. An approved request without an active grant does not authorize access. Case-insensitive duplicate User or AllowedEmail records fail closed and require administrator review. Null roles on legacy active approval records retain the existing CONSULTANT default; a profile alone never receives that default as authorization.

Approved users with no legacy User record can be provisioned after verified sign-in. New approvals and direct administrator grants create/update the active User and approval record together. Role-only edits do not grant or reactivate access.

## Own status: GET /auth/access-status

Requires verified identity, **does not require CMS approval**, and does not create/update a User. Identity always comes from the token. No email/user-ID selector is supported; query parameters cannot select a different person. Response is `Cache-Control: no-store`.

Example for a pending request:

```json
{
  "success": true,
  "accessStatus": "pending",
  "requestStatus": "PENDING",
  "profileActive": null,
  "accessApproved": false,
  "hasCmsAccess": false,
  "role": null
}
```

| Field | Contract |
| --- | --- |
| accessStatus | `not_requested`, `pending`, `rejected`, `approved`, `inactive`, `revoked`, `review_required` |
| requestStatus | Stored `PENDING`, `APPROVED`, `REJECTED`, or null when no request exists. Informational; explicit grants may coexist with an old request. |
| profileActive | User.active; null when no unique profile exists |
| accessApproved | Exactly one active canonical approval record and no ambiguous profiles |
| hasCmsAccess | accessApproved and profileActive is not false; use this for CMS gating |
| role | Canonical granted role when accessApproved, otherwise null. A role is not itself permission to enter CMS. |

`inactive` means an approved identity has a disabled profile. `revoked` means an approval record is inactive, or an approved request no longer has its grant. `review_required` means conflicting case variants; do not guess which record wins.

Only this caller's minimal state is returned: no request ID, review notes, reviewer identity, directory data, teams, or other person's information.

The retained `GET /auth/check-email?email=...` endpoint is also verified-self-only and returns `{success:true, allowed:boolean}`. A mismatched selector gets 403. Use the new status endpoint for messaging.

## HTTP errors and existing sessions

- **401:** missing, malformed, invalid or expired Microsoft token. Clear protected state and require fresh authentication.
- **403 with code CMS_ACCESS_DENIED:** identity verified but current CMS access denied:
  `{statusCode:403, code:"CMS_ACCESS_DENIED", message:"Active approved CMS access is required", accessStatus:"revoked"}`.
- Other **403** responses remain resource/role permission failures. Do not treat every 403 as global revocation.
- **5xx:** server/dependency failure. Do not label the person approved or pending based on an error; show a retry state.

For #100: on 401 or CMS_ACCESS_DENIED, block protected views, call `clearResourceCache()` and `clearNavigationSnapshots()`, and discard late responses from the previous cache generation. Do not cache access-status. Recheck status on account change, sign-in and return to the app. The backend rechecks access regardless of the frontend cache.

`GET /auth/health` is the narrow unauthenticated health exception (#25), with no identity lookup or User provisioning.

## People and team selection (#110)

`GET /people` remains ADMIN-only. Each existing person retains `id, email, firstName, lastName, role, active, teams` and gains `accessStatus, requestStatus, profileActive, accessApproved, hasCmsAccess, accessRole`.

- Existing `active` and `role` describe the stored profile, preserving existing clients.
- `accessRole` is the canonical granted role; it may differ from the stored profile until an approved sign-in synchronizes it.
- Display profile activity and CMS approval separately; an active profile alone is not approved.
- Keep the readable-name changes in #110; these fields are additive.
- `GET /auth/allowed-emails` keeps its existing response shape and filters to the same canonical approval/activity policy. Project creation and member addition also enforce it for supplied emails **and existing User IDs**.

## Legacy profile sync

`POST /auth/sync-user` is protected. It only updates the verified caller's profile. A supplied email must match that caller; a supplied googleId is ignored and never links/reassigns accounts. Frontend callers must obtain a real token; remove email-as-token fallbacks.

Public `POST /onboarding/requests` remains a request submission workflow, not sign-in. It returns only a receipt and cannot overwrite a reviewed request. Reopening a rejected/reviewed request requires administrator follow-up.

Slack connection flows require verified tokens when starting. Callbacks recheck current CMS approval and installation role. OAuth states issued before this fix are rejected without changing database records, since they could have originated through the old email-only path; those users must restart the connection flow.

## Paired frontend acceptance before #111 closes

PR #121 head `9f07bb8daf30a6000a8430581291470b01012fa6` currently maps ADMIN to approved, all other roles to denied, and any getRole error to pending. That must change: approved consultants, PMs and LCs must work too. It also sets logged-in state before approval is checked. This backend PR does not claim that frontend integration is complete.

Check the combined changes with synthetic identities:

1. Verified, never requested: status 200/not_requested; protected routes 403; no User created.
2. Pending/rejected: accurate message; no CMS data; own status only.
3. Approved consultant/PM/LC/admin: enter CMS with the granted role.
4. Administrator approves or grants access: role, active User and grant agree; later login preserves role.
5. Revoke access while a page/request is active: subsequent API request denied; all protected cache/snapshots cleared; late response cannot restore them.
6. Active profile without approval versus inactive profile with approval: People shows the distinction; neither is in the team picker.
7. Token acquisition fails: do not fall back to an email credential or interpret failure as pending approval.
8. Anonymous health request succeeds; anonymous protected requests fail.

Existing-account corrections and deployment require separate administrator review.
