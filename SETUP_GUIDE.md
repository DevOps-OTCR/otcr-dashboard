# 🚀 OTCR Dashboard Setup Guide

This guide will walk you through setting up the OTCR Dashboard from scratch.

## ✅ What We've Built

Both of your Jira tickets have been completed:

### Ticket 1: Database Schema ✅
- Complete Prisma schema with 8 models (User, Project, Deliverable, Submission, Extension, TimeEntry, Notification, ProjectMember)
- Role-based access control (Admin, PM, Consultant)
- Clerk authentication integration
- Submission versioning and approval workflow
- Extension request system

### Ticket 2: Notifications & Background Jobs ✅
- BullMQ job queue with Redis
- Slack webhook notifications
- Resend email notifications
- Automated deadline reminders (24h and 1h before)
- Extension request/response notifications
- Submission review notifications
- Scheduled cron jobs for automation

## 📋 Prerequisites

You'll need accounts/services for:

1. **PostgreSQL Database** - [Neon](https://neon.tech) (recommended) or [Supabase](https://supabase.com)
2. **Redis** - Local install OR [Upstash](https://upstash.com) (cloud Redis)
3. **Clerk** - [clerk.com](https://clerk.com) for authentication
4. **Slack** (Optional) - For notifications
5. **Resend** (Optional) - [resend.com](https://resend.com) for emails

## 🎯 Step-by-Step Setup

### Step 1: Set Up PostgreSQL Database (Neon)

1. Go to [neon.tech](https://neon.tech)
2. Sign up with GitHub
3. Click "Create Project"
4. Choose a name: `otcr-dashboard`
5. Select region closest to you
6. Copy the connection string (it looks like):
   ```
   postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Step 2: Set Up Redis

**Option A: Local Redis (for development)**
```bash
# macOS
brew install redis
brew services start redis

# Test it
redis-cli ping
# Should return: PONG
```

**Option B: Upstash (cloud, recommended)**
1. Go to [upstash.com](https://upstash.com)
2. Sign up (free tier available)
3. Create new database
4. Copy the connection string (format: `rediss://default:xxx@xxx.upstash.io:6379`)

### Step 3: Set Up Clerk Authentication

1. Go to [clerk.com](https://clerk.com)
2. Sign up and create a new application
3. Name it "OTCR Dashboard"
4. Enable only **Google** as sign-in method
5. Go to "API Keys" tab
6. Copy these two keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_`)
   - `CLERK_SECRET_KEY` (starts with `sk_test_`)

### Step 4: Set Up Slack Notifications (Optional)

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name: "OTCR Dashboard"
4. Choose your workspace
5. Go to "Incoming Webhooks"
6. Toggle "Activate Incoming Webhooks" to ON
7. Click "Add New Webhook to Workspace"
8. Choose a channel (e.g., #otcr-notifications)
9. Copy the webhook URL (looks like `https://hooks.slack.com/services/...`)

### Step 5: Set Up Resend Email (Optional)

1. Go to [resend.com](https://resend.com)
2. Sign up (free tier: 100 emails/day)
3. Click "API Keys"
4. Create new API key
5. Copy the key (starts with `re_`)
6. Verify your domain OR use `onboarding@resend.dev` for testing

### Step 6: Configure Backend Environment

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your credentials:
   ```env
   # Database (from Neon)
   DATABASE_URL="postgresql://username:password@host.neon.tech/neondb?sslmode=require"

   # Clerk (from clerk.com)
   CLERK_SECRET_KEY="sk_test_..."
   CLERK_PUBLISHABLE_KEY="pk_test_..."

   # Redis (local or Upstash)
   REDIS_URL="redis://localhost:6379"
   # OR for Upstash:
   # REDIS_URL="rediss://default:xxx@xxx.upstash.io:6379"

   # Slack (optional)
   SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."

   # Resend (optional)
   RESEND_API_KEY="re_..."
   EMAIL_FROM="notifications@otcr.com"
   ```

### Step 7: Install Dependencies

```bash
npm install
```

This will install:
- NestJS framework
- Prisma ORM
- BullMQ + IORedis
- Clerk SDK
- Resend email client
- All other dependencies

### Step 8: Set Up Database

1. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```

2. Push schema to database:
   ```bash
   npm run prisma:push
   ```

   This creates all tables in your database.

3. Seed with test data (optional):
   ```bash
   npm run prisma:seed
   ```

   This creates:
   - 1 Admin user
   - 1 PM user
   - 2 Consultant users
   - 2 Projects
   - 5 Deliverables
   - Sample time entries

### Step 9: Start the Backend Server

```bash
npm run start:dev
```

You should see:
```
✅ Database connected
🚀 Backend server running on http://localhost:4000
```

### Step 10: Test the Setup

1. **Test database connection:**
   ```bash
   npm run prisma:studio
   ```
   Opens GUI at http://localhost:5555

2. **Test API endpoint:**
   ```bash
   curl http://localhost:4000/auth/health
   ```
   Should return: `{"success":true,"message":"Auth service is running"}`

3. **Test Redis connection:**
   ```bash
   redis-cli ping
   ```
   Should return: `PONG`

## 🎉 You're Done!

Your backend is now running with:
- ✅ Database connected (PostgreSQL via Neon)
- ✅ Prisma ORM configured
- ✅ Authentication ready (Clerk)
- ✅ Job queue running (BullMQ + Redis)
- ✅ Notifications configured (Slack + Email)
- ✅ Scheduled jobs active (deadline reminders)

## 📊 View Your Data

Open Prisma Studio to see your data:
```bash
npm run prisma:studio
```

Navigate to http://localhost:5555 to view/edit:
- Users
- Projects
- Deliverables
- Submissions
- Extensions
- Notifications

## 🧪 Test Notifications

The notification system includes:

1. **Deadline Reminders**: Automatically sent 24h and 1h before deadline
2. **Extension Requests**: Sent to PM when consultant requests extension
3. **Extension Responses**: Sent to consultant when PM approves/denies
4. **Submission Reviews**: Sent when PM approves/rejects submission

To trigger a test notification, you'll need to:
1. Create a deliverable with a deadline
2. Wait for automated reminders OR
3. Use the notifications service directly

## 🔍 Monitoring Jobs

BullMQ jobs are stored in Redis. You can monitor them using:

1. **BullMQ Board** (optional):
   ```bash
   npm install -g bull-board
   bull-board
   ```

2. **Redis CLI**:
   ```bash
   redis-cli
   KEYS *
   ```

## ⚠️ Common Issues

### "Database connection failed"
- Check your `DATABASE_URL` is correct
- Ensure database is accessible from your machine
- Verify SSL mode is set: `?sslmode=require`

### "Redis connection failed"
- Check Redis is running: `redis-cli ping`
- If using Upstash, verify connection string format

### "Prisma client not found"
- Run: `npm run prisma:generate`

### Notifications not sending
- Check Slack webhook URL is correct
- Verify Resend API key is valid
- Ensure Redis is running (required for job queue)

## 📚 Next Steps

1. **Build the frontend** (Next.js + Tailwind)
2. **Add CRUD API endpoints** for projects, deliverables
3. **Implement file upload** (Cloudflare R2 or AWS S3)
4. **Set up CI/CD** pipeline
5. **Deploy to production** (Railway, Fly.io, or Render)

## 🆘 Need Help?

- Check [backend/README.md](backend/README.md) for detailed docs
- Review [prisma/schema.prisma](backend/prisma/schema.prisma) for database structure
- View notification code in [src/notifications/](backend/src/notifications/)

## ✅ Verification Checklist

Before moving forward, verify:

- [ ] Backend server starts without errors
- [ ] Database connection successful (Prisma Studio opens)
- [ ] Redis connection working (`redis-cli ping`)
- [ ] Clerk authentication configured
- [ ] Environment variables all set in `.env`
- [ ] Test data seeded successfully
- [ ] `/auth/health` endpoint returns success

---

**Congratulations! Your backend is fully set up and ready for development.** 🎉
