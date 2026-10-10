# OTCR Dashboard

OTCR Dashboard is a monorepo with a Next.js frontend and a NestJS backend for managing consulting projects, workstreams, slide submissions, client notes, and team coordination.

## Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS
- Authentication: Microsoft Entra ID (MSAL on the client)
- Backend: NestJS, Prisma, PostgreSQL, Redis, BullMQ
- Integrations: Slack, Resend

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

Authenticated users are redirected to role-specific routes instead of a shared `/dashboard` page.

- `CONSULTANT` -> `/consultant`
- `LC` -> `/lc`
- `PM` -> `/pm`
- `PARTNER` -> `/partner`
- `EXECUTIVE` -> `/partner`
- `ADMIN` -> `/pm` (with admin badge, admin switcher, and full access)

## Local Development

### Prerequisites

- Node.js 22 LTS, version 22.13.0 or later (CI uses Node 22)
- PostgreSQL
- Redis

### Backend setup

```bash
cd backend
npm install
cp .env.example .env
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

## Production Deployment

Deploy frontend and backend as separate services.

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
