# OTCR Dashboard

A full-stack project management dashboard for tracking consulting projects, deliverables, time tracking, and team coordination. Features role-based views for Project Managers, Consultants, and Admins.

## Tech Stack

**Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, NextAuth (Google OAuth)
**Backend:** NestJS 11, Prisma ORM, PostgreSQL, Redis, BullMQ
**Integrations:** NextAuth + Google OAuth (Auth), Resend (Email), Slack (Notifications), Cloudflare R2 (File Storage)

## Project Structure

```
otcr-dashboard/
├── frontend/          # Next.js web application
├── backend/           # NestJS API server
├── docker-compose.prod.yml
└── nginx.conf
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- npm or yarn

## Services & API Keys Required

You'll need accounts and API keys from these services:

| Service | Purpose | Get it from |
|---------|---------|-------------|
| **Google Cloud** | OAuth (Authentication) | https://console.cloud.google.com |
| **PostgreSQL** | Database | Local install or Neon/Supabase |
| **Redis** | Job queues & caching | Local install or Redis Cloud |
| **Resend** | Email notifications | https://resend.com |
| **Slack** | Slack notifications | Create a webhook in your Slack workspace |
| **Cloudflare R2** | File storage (optional) | https://cloudflare.com |

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd otcr-dashboard

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

**Backend** - Create `backend/.env`:
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/otcr_dashboard

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

# Email (from Resend dashboard)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=notifications@yourdomain.com

# Slack (create incoming webhook)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxxxx

# File Storage - Optional (from Cloudflare R2)
R2_ACCOUNT_ID=xxxxx
R2_ACCESS_KEY_ID=xxxxx
R2_SECRET_ACCESS_KEY=xxxxx
R2_BUCKET_NAME=otcr-deliverables

# Server
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

**Frontend** - Create `frontend/.env.local`:
```env
# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# NextAuth
NEXTAUTH_SECRET=your-random-secret  # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Setup Database

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed with test data (optional)
npx prisma db seed
```

### 4. Start the Application

**Option A: Run separately (recommended for development)**

```bash
# Terminal 1 - Backend
cd backend
npm run start:dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Option B: Docker (for production)**

```bash
cp .env.production.example .env.production
# Edit .env.production with your values
docker-compose -f docker-compose.prod.yml up -d
```

### 5. Access the Application

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:4000
- **API Health Check:** http://localhost:4000/auth/health

## Key Features

- **Role-Based Dashboards** - Different views for PM, Consultant, Admin
- **Task Management** - Create, assign, and track deliverables
- **Time Tracking** - Log hours per project
- **Extension Requests** - Request and approve deadline extensions
- **File Uploads** - Upload and manage deliverables
- **Notifications** - Email and Slack alerts for deadlines
- **Dark Mode** - Toggle between light and dark themes

## Deployment Options

1. **Vercel + Railway** - Frontend on Vercel, Backend on Railway
2. **Docker** - Self-hosted using docker-compose
3. **AWS** - Amplify (Frontend) + ECS (Backend) + RDS (Database)

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

## Documentation

Additional documentation is available in the `docs/` folder:

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment guide for all platforms |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and design |
| [PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) | Pre-launch checklist |
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | Detailed onboarding guide |
| [ROLE_DASHBOARDS.md](docs/ROLE_DASHBOARDS.md) | Role-based features documentation |

## Environment Files Reference

| File | Purpose | Commit? |
|------|---------|---------|
| `backend/.env` | Backend secrets | NO |
| `backend/.env.example` | Backend template | YES |
| `frontend/.env.local` | Frontend secrets | NO |
| `frontend/.env.local.example` | Frontend template | YES |
| `.env.production.example` | Production template | YES |

## License

Proprietary - All rights reserved
