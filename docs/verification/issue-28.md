# Issue #28: task authorization

Task routes now use the shared authentication guard and its resolved user.
Object authorization runs before reads, updates, deletions, and related
calendar changes. Creation and reassignment validate the proposed project and
audience as well as access to the original task.

## Permission rules

| Caller relationship | Read | Update/delete |
| --- | --- | --- |
| Admin | Yes | Yes |
| Creator or personally assigned user | Yes | Yes |
| Active project member or project PM | Yes | PM/LC team managers only |
| Broadcast recipient without another qualifying relationship | Yes | No |
| Unrelated user or departed member without another qualifying relationship | No | No |

These rules distinguish the issue's read-access relationships from its
consultants-manage-their-own / PM-and-LC-manage-their-team requirement.
Being a recipient of a shared task does not grant permission to rewrite or
delete that task for everyone.

- A caller may create a personal task for themselves without a project.
- A supplied project must exist and be accessible to the caller.
- PMs and LCs may assign active members or the PM of their own project.
- Team-wide assignments require an accessible project and an Admin, PM, or LC.
- Organization-wide `ALL` and `ALL_PMS` assignments require an Admin.
- Changing a task's project or assignment rechecks the resulting assignment.
- Departed memberships (`leftAt` set) do not grant project access.

## Verification

From `backend/`, install the lockfile dependencies and generate the Prisma
client using local development configuration. Client generation does not
require applying a schema or running database setup scripts.

```sh
npm test -- --runInBand tasks.authorization
npx tsc --noEmit
npm run build
```

All 41 tests pass, and TypeScript checking and the NestJS build pass.

The suite covers cross-team read/update/delete, permitted creator/assignee and
team-manager access, former members, broad audience assignments, creation,
project moves, reassignment, missing tasks, and calendar failures. Rejected
operations assert that no database mutations or calendar calls occur.

HTTP tests run the actual tasks controller, authentication guard, and service
in a local NestJS application with a synthetic token verifier, user lookup,
Prisma double, and calendar double. Cross-team GET/PATCH/DELETE return 403;
unauthenticated callers are rejected by the shared guard. The three cross-team
HTTP regression cases fail against the original controller/service (returning
200), and pass against this change (returning 403).

No production database, credentials, or live calendar mutations are used.
Real PostgreSQL queries and external calendar integration are not exercised
by these tests. There are no visible UI changes, so screenshots are not applicable.
