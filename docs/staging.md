# Staging deployment

`staging` is the shared integration branch. Feature PRs target `staging`; after validation and testing, open a PR from `staging` to `main` to release. Merge production hotfixes from `main` back into `staging`.

PR Validation runs on pushes and PRs targeting either branch. The production GitHub Pages workflow deploys only `main`.

## Render setup

Create a Blueprint from `DevOps-OTCR/otcr-dashboard` using the connected GitHub integration:

- Branch: `staging`
- Blueprint path: `render.staging.yaml`
- Frontend: `otcr-dashboard-staging`, a static export using the same build mode as production Pages
- Backend: `otcr-dashboard-staging-api`, a Node web service
- Database: `otcr-dashboard-staging-db`, a separate Postgres instance
- Queue: `otcr-dashboard-staging-redis`, a separate Key Value instance

Both application services use **After CI Checks Pass** auto-deploys. Render requires a connected GitHub account for automatic deploys. Select the repository through that integration instead of importing its public Git URL.

The Blueprint selects free plans. Free web services spin down when idle, free Postgres expires after 30 days, and free Key Value loses queued jobs when restarted. Render allows one free Postgres and one free Key Value instance per workspace. Review the plans before creating resources; use paid plans for persistent staging when needed. See [Render free service limits](https://render.com/docs/free).

## Configuration

Render prompts for these values during Blueprint creation:

| Service | Variable | Value |
| --- | --- | --- |
| Frontend | `NEXT_PUBLIC_MSAL_CLIENT_ID` | Microsoft Entra application client ID used for staging |
| Frontend | `NEXT_PUBLIC_MSAL_AUTHORITY` | `https://login.microsoftonline.com/<tenant-id>` |
| Backend | `FRONTEND_URL` | The staging frontend's assigned `https://...onrender.com` URL |

After Render assigns the service URLs:

1. Verify the backend's `FRONTEND_URL` exactly matches the frontend's assigned URL. Update it and redeploy the backend if necessary.
2. Register `https://<frontend-host>/auth/callback` as a **Single-page application** redirect URI in the Microsoft Entra application used for staging.
3. Open the frontend and complete sign-in with a test account. Initialize only the intended testers in the staging database's `AllowedEmail` table, with the roles needed for testing. Do not run the existing seed script against staging; it includes a fixed directory of user emails and sample records.

The frontend build derives its app URL and redirect URI from Render's assigned URL. Its API URL references the staging backend. Both database connection variables reference the staging database, and Redis references the staging queue. The backend start command applies committed Prisma migrations before starting. Its unauthenticated `/__meta` route is the Render health check; `/auth/health` requires authentication.

Keep production database, Redis, Slack, email, calendar, and alumni data out of this environment. Optional integrations start unconfigured. To test them, add staging-only credentials in Render and use a test Slack workspace and calendar.

## Verify a deployment

1. Confirm both PR Validation jobs passed for the pushed `staging` commit and both Render deployments succeeded.
2. Open `https://<backend-host>/__meta` and confirm `render.gitCommit` matches the staging commit.
3. Open the frontend, sign in, and verify a test team and deliverable can be created and loaded after refreshing.
4. Check API requests go to the staging backend and that browser CORS checks succeed.
5. Test the feature being promoted, then open the `staging` to `main` release PR.

For an application rollback, use Render's deployment history to select the last working commit for each service and turn off auto-deploys until the branch is corrected. Database migrations need a separate recovery plan; rolling back an application does not undo a migration.
