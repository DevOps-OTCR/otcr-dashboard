# OTCR Dashboard - Tech Stack & Quick Start Guide

## Project Structure

```
otcr-dashboard/
├── backend/                 # NestJS API server
│   ├── src/
│   │   ├── auth/           # Authentication module
│   │   ├── notifications/  # Notification system
│   │   ├── integrations/   # Slack & Email services
│   │   ├── jobs/           # Scheduled cron jobs
│   │   └── prisma/         # Database module
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.ts         # Test data seeder
│   └── .env                # Backend environment variables
│
├── frontend/                # Next.js web application
│   ├── app/                # Next.js app router pages
│   ├── components/         # React components
│   ├── lib/                # Utilities & API client
│   └── .env.local          # Frontend environment variables
│
└── docs/                   # Documentation
    ├── ARCHITECTURE.md
    ├── GETTING_STARTED.md
    ├── RUNNING_LOCALLY.md
    └── DEPLOYMENT.md
```

## Tech Stack

### Frontend
- **Framework**: Next.js 16 (React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4.1
- **Authentication**: NextAuth v5 (Google OAuth)
- **File Upload**: React Dropzone
- **HTTP Client**: Axios

### Backend
- **Framework**: NestJS 11
- **Language**: TypeScript
- **Database ORM**: Prisma 7
- **Database**: PostgreSQL
- **Job Queue**: BullMQ
- **Cache/Queue Storage**: Redis (ioredis)
- **Authentication**: Google OAuth (via NextAuth)
- **Email Service**: Resend
- **Task Scheduling**: @nestjs/schedule (Cron)

### Infrastructure & Services
- **Database Hosting**: Neon.tech (PostgreSQL)
- **Redis Hosting**: Upstash or Local
- **Authentication Provider**: Google OAuth (via NextAuth)
- **Email Provider**: Resend
- **Notifications**: Slack Webhooks
- **File Storage**: Cloudflare R2 (optional)

### Development Tools
- **Package Manager**: npm
- **Database GUI**: Prisma Studio
- **Build Tool**: TypeScript Compiler
- **Containerization**: Docker (production)

## Getting Started

### Prerequisites

1. **Node.js** 18+ installed
2. **npm** or **yarn** package manager
3. **PostgreSQL** database (local or cloud)
4. **Redis** server (local or cloud)

### Required Services & API Keys

You'll need to sign up for these services (all offer free tiers):

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **Google Cloud** | OAuth Credentials | https://console.cloud.google.com |
| **Neon** | PostgreSQL Database | https://neon.tech |
| **Redis** | Job Queue & Caching | Local install or https://upstash.com |
| **Resend** | Email Notifications | https://resend.com (optional) |
| **Slack** | Team Notifications | Create webhook (optional) |

### Step 1: Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd otcr-dashboard

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Step 2: Set Up Services

#### A. Google OAuth Setup (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **Google+ API** (or Google Identity API)
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure OAuth consent screen:
   - User Type: External (or Internal if using Google Workspace)
   - App name: "OTCR Dashboard"
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
6. Copy the credentials:
   - `GOOGLE_CLIENT_ID` (starts with numbers and ends with `.apps.googleusercontent.com`)
   - `GOOGLE_CLIENT_SECRET` (starts with `GOCSPX-`)

#### B. PostgreSQL Database (5 minutes)

1. Go to [neon.tech](https://neon.tech) and sign up
2. Create a new project: "otcr-dashboard"
3. Copy the connection string (format: `postgresql://user:pass@host/db?sslmode=require`)

#### C. Redis (2 minutes)

**Option 1: Local (Mac)**
```bash
brew install redis
brew services start redis
redis-cli ping  # Should return: PONG
```

**Option 2: Cloud (Upstash)**
1. Go to [upstash.com](https://upstash.com)
2. Create a Redis database
3. Copy the connection string

### Step 3: Configure Environment Variables

#### Backend Configuration

Create `backend/.env`:

```env
# Database (from Neon)
DATABASE_URL="postgresql://username:password@host.neon.tech/neondb?sslmode=require"

# Redis
REDIS_URL="redis://localhost:6379"
# OR for Upstash: REDIS_URL="rediss://default:xxx@xxx.upstash.io:6379"

# Optional: Email & Slack
RESEND_API_KEY="re_..."
EMAIL_FROM="notifications@otcr.com"
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."

# Server Configuration
PORT=4000
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"
```

#### Frontend Configuration

Create `frontend/.env.local`:

```env
# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID="123456789-abc...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."

# NextAuth Configuration
NEXTAUTH_SECRET="your-random-secret-key-here"  # Generate with: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"

# API Configuration
NEXT_PUBLIC_API_URL="http://localhost:4000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Step 4: Initialize Database

```bash
cd backend

# Generate Prisma client
npm run prisma:generate

# Push schema to database
npm run prisma:push

# Seed with test data
npm run prisma:seed
```

Expected output:
```
🌱 Seeding database...
✅ Users created
✅ Projects created
✅ Deliverables created
🎉 Seeding completed successfully!
```

## 🏃 How to Run

### Development Mode (Recommended)

#### Terminal 1: Backend Server

```bash
cd backend
npm run start:dev
```

You should see:
```
✅ Database connected
🚀 Backend server running on http://localhost:4000
```

#### Terminal 2: Frontend Application

```bash
cd frontend
npm run dev
```

You should see:
```
▲ Next.js 16.x.x
  - Local:        http://localhost:3000
  - Ready in 2.5s
```

### Access the Application

- **Frontend Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **API Health Check**: http://localhost:4000/auth/health
- **Database GUI (Prisma Studio)**: Run `npm run prisma:studio` in backend folder → http://localhost:5555

### Production Mode

#### Using Docker

```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d
```

#### Manual Production Build

```bash
# Backend
cd backend
npm run build
npm run start:prod

# Frontend
cd frontend
npm run build
npm run start
```

## 📋 Useful Commands

### Backend Commands

```bash
# Development
npm run start:dev          # Start with hot reload
npm run start:debug        # Start with debugging enabled

# Database
npm run prisma:studio      # Open database GUI (http://localhost:5555)
npm run prisma:migrate     # Create and apply migration
npm run prisma:push        # Push schema changes (dev only)
npm run prisma:seed        # Seed test data
npm run prisma:generate    # Regenerate Prisma client

# Production
npm run build              # Compile TypeScript
npm run start:prod         # Run production build
```

### Frontend Commands

```bash
# Development
npm run dev                # Start development server

# Production
npm run build              # Build for production
npm run start              # Start production server

# Utilities
npm run lint               # Run ESLint
```



## Troubleshooting

### Database Connection Failed
```bash
# Test connection
cd backend
npx prisma db pull
```
**Fix**: Verify `DATABASE_URL` format in `backend/.env`

### Redis Connection Failed
```bash
# Check if Redis is running
redis-cli ping
```
**Fix**: Start Redis with `brew services start redis` (Mac) or check cloud Redis URL

### NextAuth Authentication Error
**Fix**: 
- Ensure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET` are set in `frontend/.env.local`
- Verify the redirect URI in Google Cloud Console matches: `http://localhost:3000/api/auth/callback/google`
- Generate a new `NEXTAUTH_SECRET` with: `openssl rand -base64 32`

### Port Already in Use
```bash
# Find and kill process on port 4000
lsof -ti:4000 | xargs kill -9

# Or change port in .env
PORT=4001
```

### Module Not Found Errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Prisma Client Not Found
```bash
cd backend
npm run prisma:generate
```

## 🎯 Key Features

- **Role-Based Dashboards**: Different views for PM, Consultant, and Admin
- **Authentication**: Google OAuth via NextAuth
- **Project Management**: Create and track projects and deliverables
- **Time Tracking**: Log hours per project
- **Extension Requests**: Request and approve deadline extensions
- **File Uploads**: Upload and manage deliverables
- **Notifications**: Automated email and Slack alerts for deadlines
- **Background Jobs**: BullMQ queue for async notification processing
- **Scheduled Tasks**: Cron jobs for deadline reminders and cleanup
