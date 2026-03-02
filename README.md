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

- Node.js 20+
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
npx prisma migrate dev
npm run start:dev
```

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
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-me
```

Then run:

```bash
npm run dev
```

## Production Deployment

Deploy frontend and backend as separate services.

### Render backend service

- Root directory: `backend`
- Build command: `npm install && npx prisma generate && npm run build`
- Start command: `npm run start:prod`

Backend production env vars:

- `DATABASE_URL`
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

