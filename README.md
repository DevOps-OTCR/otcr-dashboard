# OTCR Dashboard

OTCR Dashboard is a monorepo with a Next.js frontend and a NestJS backend for managing consulting projects, workstreams, slide submissions, client notes, and team coordination.

## Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS
- Authentication: Microsoft Entra ID (MSAL on the client)
- Backend: NestJS, Prisma, PostgreSQL, Redis, BullMQ
- Integrations: Slack, Resend

CMS dashboard issue reports can be queued for GitHub intake and automatic
Copilot assignment for clear text, styling, and documentation fixes. Both
integrations are disabled by default. See [CMS issue workflow](docs/cms-issue-workflow.md)
for setup, routing, and failure recovery.

## Repository Layout

```text
otcr-dashboard/
├── frontend/      # Next.js application
├── backend/       # NestJS API
├── env/           # env templates
├── scripts/       # helper scripts
└── docker-compose.prod.yml
```

## Current Role Routing

Authenticated users are redirected to their role's default route. Navbar permissions come from the resolved role, not the URL.

- `CONSULTANT` -> `/consultant`
- `LC`, `PM`, `PARTNER`, `EXECUTIVE` -> `/overview`
- `ADMIN` -> `/overview` (with admin badge, admin switcher, and full access)

The legacy `/pm`, `/lc`, and `/partner` URLs redirect to `/overview` on the client, so old bookmarks keep working in the static export.

## Local Development

### Prerequisites

- Node.js 22 LTS, version 22.13.0 or later (CI uses Node 22)
- PostgreSQL
- Redis

### Backend setup

```bash
cd backend
npm install
cp ../env/env.example .env
```

Set at least:

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
PORT=4000
FRONTEND_URL=http://localhost:3000
```

Then run:

```bash
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

`prisma migrate deploy` applies the committed migrations in `backend/prisma/migrations` to your local database. When you change `schema.prisma`, create a new reviewed migration with `npm run prisma:migrate` (`prisma migrate dev`) rather than running `prisma db push`.

### Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env.local` with at least:

```env
NEXT_PUBLIC_MSAL_CLIENT_ID=...
NEXT_PUBLIC_MSAL_AUTHORITY=https://login.microsoftonline.com/<tenant-id>
NEXT_PUBLIC_MSAL_REDIRECT_URI=http://localhost:3000/auth/callback
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_GEOAPIFY_API_KEY=your-geoapify-key
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-me
```

Then run:

```bash
npm run dev
```

## Agentic CMS development

All Agentic CMS work must use the backend-controlled release flag, which
defaults to off. Read [the integration guide](docs/agentic-cms.md) before adding
bot UI, MCP tools, context uploads, reviews or skills. It documents local Lumen
setup, pilot access, required code boundaries, rollback and CI checks.
For Group 2's five read-only tools, see [MCP connection and usage](docs/agentic-cms-mcp.md).

## Linting

Run the same lint commands used by PR Validation from the repository root:

```bash
npm --prefix frontend run lint
npm --prefix backend run lint
```

The frontend uses Next.js Core Web Vitals rules. The backend uses the recommended ESLint and TypeScript rules. Generated output and dependencies are excluded.

Each application commits an `eslint-suppressions.json` file containing the existing error counts by file and rule. Errors in new files, errors from rules without a suppression, and increased error counts fail lint. Existing violations still need cleanup; counts do not identify individual occurrences, so replacing an old violation with another of the same rule in the same file can remain within the recorded count. Warnings are reported without failing CI.

When fixing existing violations, remove their unused suppressions and commit the updated file:

```bash
npm --prefix frontend run lint:prune
npm --prefix backend run lint:prune
```

CI only runs `lint` and never updates suppressions. Do not regenerate all suppressions to make new errors pass. See [ESLint bulk suppressions](https://eslint.org/docs/latest/use/suppressions).

## Local database integration tests

Install the locked backend dependencies (`npm --prefix backend ci --ignore-scripts`)
and start Docker Desktop (Docker Engine with Compose also works on Linux). Then,
from the repository root:

```bash
npm --prefix backend run test:integration
```

This starts the dedicated PostgreSQL 18 test container, waits for it to be ready,
generates Prisma's client and runs the CMS read-operation integration tests.
It uses `docker-compose.test.yml`, loopback port **55439**, and a separate
`otcr_cms_test` database with synthetic local credentials. The command overrides
database connection variables for its child processes; no production connection
or real client data is used. Each test run creates a unique schema, applies the
committed migrations, inserts synthetic records and removes its schema afterward.

```bash
npm --prefix backend run test:db:up      # Start/wait for PostgreSQL only
npm --prefix backend run test:db:status  # Show the test container
npm --prefix backend run test:db:down    # Stop/remove the container; retain its volume
```

The database remains running after tests for reuse. These commands operate only
on the `otcr-cms-test` Compose project. They do not start the CMS or enable Agentic
CMS; a separate development database is still needed when running the application.
Unit tests (`npm --prefix backend test -- --runInBand`) need no running database.
CI supplies its own PostgreSQL service and runs the same integration suite.

## Browser navigation tests

Install the browser after installing frontend dependencies, then run the suite:

```bash
cd frontend
npx --no-install playwright install chromium
npm run test:navigation:browser
```

The suite checks navigation, cached content, and trailing-slash routes in headless Chromium. It uses the real page components with mocked routing, authentication, and API responses; it does not test the deployed GitHub Pages site or real sign-in.

PR Validation runs the frontend check in the official Playwright container, which includes Chromium and its Linux dependencies. Keep the container tag in `.github/workflows/pr-validation.yml` aligned with the locked Playwright version when upgrading. CI verifies that the preinstalled browser launches before running the checks. A browser test failure also blocks Pages deployment. Set `NAVIGATION_BROWSER_CHANNEL=chrome` to use an installed Chrome browser locally.

## Production Deployment

Deploy frontend and backend as separate services.

### GitHub Pages frontend

PR Validation is the single entry point for validation and Pages deployment. Pull requests run the required frontend and backend checks once. Successful pushes to `main` then call the reusable Pages workflow, which checks out the same commit that passed validation and builds with production configuration.

To redeploy manually, run **PR Validation** from the Actions tab with the `main` branch selected. Validation must succeed before deployment starts. Manual runs on other branches validate without deploying. Every successful push to `main` can deploy, including backend-only changes.

### Render backend service

- Root directory: `backend`
- Build command: `npm install && npx prisma generate && npm run build`
- Start command: `npm run start:prod` (this runs `prisma migrate deploy` before starting)

Backend production env vars:

- `DATABASE_URL`
- `DIRECT_URL` — direct (non-pooled) Postgres URL used by `prisma migrate deploy`; set this if `DATABASE_URL` points at a pooled endpoint
- `REDIS_URL`
- `FRONTEND_URL`
- `SLACK_WEBHOOK_URL` if used
- `RESEND_API_KEY` if used
- `EMAIL_FROM` if used
- Slack OAuth env vars if Slack install flow is enabled

### Render frontend service

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Start command: `npm run start`

Frontend production env vars:

- `NEXT_PUBLIC_API_URL=https://<backend-service>.onrender.com`
- `NEXT_PUBLIC_APP_URL=https://<frontend-service>.onrender.com`
- `NEXT_PUBLIC_MSAL_REDIRECT_URI=https://<frontend-service>.onrender.com/auth/callback`
- `NEXTAUTH_URL=https://<frontend-service>.onrender.com`
- `NEXTAUTH_SECRET=...`
- MSAL public env vars
