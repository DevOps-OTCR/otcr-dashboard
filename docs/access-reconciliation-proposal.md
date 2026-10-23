# Administrator review proposal: User / AllowedEmail discrepancies

This is a proposal for #112, not a migration or a request to bulk approve users. No production data has been read or changed for this implementation. Tests use synthetic identities.

## Review before deploying enforcement

An administrator should run a read-only inventory in the intended environment, review the proposed actions, and confirm at least one working approved ADMIN identity. An active User or historical session alone will no longer grant access. Check both primary and backup administrators before rollout so inconsistent records cannot lock out every reviewer.

Export only User ID, normalized email, profile activity/role, AllowedEmail ID/activity/role and onboarding status/granted role. Keep the export restricted to administrators; do not put real accounts or reviewer notes in a public PR. Group by `lower(trim(email))` and report duplicate groups separately before comparing one-to-one records.

| Discrepancy | Proposed review action |
| --- | --- |
| Active User, no active AllowedEmail | Deny by default. Verify approval evidence with leadership. Only explicit administrator approval may create/activate a grant. |
| Approved request, missing/inactive grant | Determine whether access was intentionally revoked or the old approval was incomplete. Never infer permission from historical approval alone. |
| Active grant, inactive profile | Preserve the inactive profile and deny access. Reactivation requires an explicit administrator decision. |
| Active grant, no User | Confirm that it is an intentional grant. New direct grants provision both records; legacy approved identities can provision on verified sign-in or manager assignment. |
| User role differs from grant | Confirm intended role. AllowedEmail is authoritative for API authorization; approved login syncs the profile to that role. A role edit alone must not activate access. |
| Active grant with null role | Existing behavior defaults to CONSULTANT. Review any intended elevated role explicitly. |
| Active grant with old pending/rejected request | Check whether it was a later intentional direct grant. The active grant remains authoritative; preserve the review history. |
| Duplicate normalized emails in either table | Deny ambiguous identities. Administrator must identify the correct account and preserve related records before resolving duplicates. No automatic merge/delete. |
| Leading/trailing whitespace in stored email | Normalize only after manual identity review; ordinary writers normalize new inputs. Treat unmatched legacy records as requiring reconciliation. |
| User-only ADMIN | Do not grandfather by role. Verify and explicitly grant the correct administrator account before deployment. |

## Suggested read-only inventory

Run under a read-only database role. This query lists discrepancies; it does not propose executable changes.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH users_by_email AS (
  SELECT lower(trim(email)) AS email, count(*) AS user_count,
         jsonb_agg(jsonb_build_object(
           'id', id, 'email', email, 'active', active, 'role', role
         )) AS profiles
  FROM "User"
  GROUP BY lower(trim(email))
), grants_by_email AS (
  SELECT lower(trim(email)) AS email, count(*) AS grant_count,
         jsonb_agg(jsonb_build_object(
           'id', id, 'email', email, 'active', active, 'role', role
         )) AS grants
  FROM "AllowedEmail"
  GROUP BY lower(trim(email))
), requests_by_email AS (
  SELECT lower(trim(email)) AS email,
         jsonb_agg(jsonb_build_object(
           'status', status, 'grantedRole', "grantedRole"
         )) AS requests
  FROM "OnboardingRequest"
  GROUP BY lower(trim(email))
), identities AS (
  SELECT email FROM users_by_email
  UNION SELECT email FROM grants_by_email
  UNION SELECT email FROM requests_by_email
)
SELECT i.email, coalesce(u.user_count, 0) AS user_count,
       coalesce(g.grant_count, 0) AS grant_count,
       u.profiles, g.grants, r.requests
FROM identities i
LEFT JOIN users_by_email u USING (email)
LEFT JOIN grants_by_email g USING (email)
LEFT JOIN requests_by_email r USING (email)
ORDER BY i.email;

ROLLBACK;
```

The query returns a full inventory so reviewers can apply all categories, including mismatches inside JSON arrays. Reviewers should record a decision, evidence, approver and intended role per discrepancy. A separate reviewed change must implement any approved corrections, with before/after values and a rollback plan.

## Rollout and validation

1. Agree the response contract with #113/#110 and the revocation handling with #100.
2. Complete synthetic backend tests and combined frontend checks; don't close #111 on backend evidence alone.
3. Administrator reviews the inventory, confirms approved ADMIN access, and separately authorizes each needed correction.
4. Deploy paired changes through the normal reviewed process. Verify approved users across roles, pending/rejected denial, revocation on an existing session, People status and team eligibility.
5. Monitor auth errors without logging tokens. If rollout must be paused, maintain approval enforcement; do not restore email-as-token access.

No bulk-approval script, schema migration, production account changes or deployment are included in #112.
