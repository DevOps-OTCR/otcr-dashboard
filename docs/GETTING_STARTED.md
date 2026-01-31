# 🚀 Getting Started - OTCR Dashboard

Welcome! This guide will help you get the OTCR Dashboard backend running on your machine.

## ✅ What's Been Built

Your two Jira tickets are **100% complete**:

### ✅ Ticket 1: Database Schema
- Complete Prisma schema with 8 models
- User, Project, Deliverable, Submission, Extension, TimeEntry, Notification, ProjectMember
- Full relational structure with proper indexes
- Clerk authentication integration

### ✅ Ticket 2: Notifications & Background Jobs
- BullMQ job queue with Redis
- Slack and Email notifications
- Automated deadline reminders (24h, 1h)
- Extension request workflows
- Scheduled cron jobs

## 📚 Documentation

Before you start, familiarize yourself with these docs:

1. **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Detailed step-by-step setup instructions
2. **[README.md](README.md)** - Project overview and quick start
3. **[backend/README.md](backend/README.md)** - Backend-specific documentation
4. **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture diagrams
5. **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - What was built

## ⚡ Quick Start (5 Minutes)

### Step 1: Get Your Credentials (Do This First!)

You'll need:

1. **PostgreSQL Database** - [Sign up at Neon](https://neon.tech)
   - Create project → Copy connection string

2. **Redis** - Either:
   - Install locally: `brew install redis && brew services start redis`
   - OR use [Upstash](https://upstash.com) (cloud Redis)

3. **Clerk Authentication** - [Sign up at Clerk](https://clerk.com)
   - Create app → Enable Google only → Copy API keys

4. **Slack Webhook** (Optional) - [Create webhook](https://api.slack.com/messaging/webhooks)

5. **Resend Email** (Optional) - [Sign up at Resend](https://resend.com)

### Step 2: Install & Configure

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your credentials:
```env
DATABASE_URL="postgresql://..." # From Neon
CLERK_SECRET_KEY="sk_test_..."  # From Clerk
REDIS_URL="redis://localhost:6379"
SLACK_WEBHOOK_URL="..."         # Optional
RESEND_API_KEY="..."            # Optional
```

### Step 3: Set Up Database

```bash
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

### Step 4: Start the Server

```bash
npm run start:dev
```

You should see:
```
✅ Database connected
🚀 Backend server running on http://localhost:4000
```

### Step 5: Verify It Works

```bash
# Test the health endpoint
curl http://localhost:4000/auth/health

# Open database GUI
npm run prisma:studio
```

## 🎯 What You Can Do Now

### 1. View Your Data

```bash
npm run prisma:studio
```

Opens at http://localhost:5555 - You'll see:
- 4 test users (admin, PM, 2 consultants)
- 2 projects
- 5 deliverables
- Time entries

### 2. Test Authentication

The backend is ready to authenticate users via Clerk. When you build the frontend, users will:
1. Sign in with Google via Clerk
2. Frontend gets JWT token
3. Frontend sends requests with `Authorization: Bearer {token}`
4. Backend verifies and syncs user to database

### 3. Explore the Code

Key files to understand:

**Database:**
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) - All models

**Authentication:**
- [backend/src/auth/auth.service.ts](backend/src/auth/auth.service.ts) - Clerk integration

**Notifications:**
- [backend/src/notifications/notifications.service.ts](backend/src/notifications/notifications.service.ts) - Queue manager
- [backend/src/notifications/notifications.processor.ts](backend/src/notifications/notifications.processor.ts) - Job worker

**Integrations:**
- [backend/src/integrations/slack.service.ts](backend/src/integrations/slack.service.ts) - Slack webhooks
- [backend/src/integrations/email.service.ts](backend/src/integrations/email.service.ts) - Email templates

**Scheduled Jobs:**
- [backend/src/jobs/deadline-scheduler.service.ts](backend/src/jobs/deadline-scheduler.service.ts) - Cron jobs

## 🔧 Useful Commands

```bash
# Development
npm run start:dev          # Start with hot reload
npm run start:debug        # Start with debugging

# Database
npm run prisma:studio      # Open database GUI
npm run prisma:migrate     # Create migration
npm run prisma:seed        # Add test data
npx prisma migrate reset   # Reset database (careful!)

# Build
npm run build              # Compile TypeScript
npm run start:prod         # Run production build
```

## 🐛 Troubleshooting

### "Database connection failed"
```bash
# Check your DATABASE_URL is correct
npx prisma db pull
```

### "Redis connection failed"
```bash
# Check Redis is running
redis-cli ping
# Should return: PONG
```

### "Prisma client not found"
```bash
# Regenerate Prisma client
npm run prisma:generate
```

### Port 4000 already in use
```bash
# Change port in .env
PORT=4001
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── auth/              ← Authentication with Clerk
│   ├── notifications/     ← Notification system
│   ├── integrations/      ← Slack & Email
│   ├── jobs/              ← Scheduled cron jobs
│   ├── prisma/            ← Database module
│   └── common/            ← Shared utilities
├── prisma/
│   ├── schema.prisma      ← Database schema
│   └── seed.ts            ← Test data
└── .env                   ← Your credentials (not in git)
```

## 🎨 Understanding the Architecture

The system has 3 main parts:

### 1. Database (PostgreSQL via Prisma)
Stores all data: users, projects, deliverables, submissions, notifications

### 2. API Server (NestJS)
Handles HTTP requests, authentication, business logic

### 3. Background Jobs (BullMQ + Redis)
Processes notifications and scheduled tasks asynchronously

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed diagrams.

## 🔔 How Notifications Work

1. **Event occurs** (e.g., deadline approaching)
2. **Service creates job** → Added to BullMQ queue
3. **Job stored in Redis** → Persistent queue
4. **Worker picks up job** → NotificationsProcessor
5. **Send notification** → Slack and/or Email
6. **Update database** → Mark as sent

All notifications are logged in the `Notification` table.

## 🕐 Scheduled Jobs

These run automatically:

- **Every hour:** Check for upcoming deadlines, mark overdue items
- **Daily at 9 AM:** Send summary to PMs
- **Daily at midnight:** Clean up old notifications

To see job logs, watch the console when running `npm run start:dev`.

## 🚦 Next Steps

### Immediate
1. ✅ Get backend running (you're here!)
2. 🔄 Build the frontend (Next.js)
3. 🔄 Connect frontend to backend

### Soon
1. Add CRUD API endpoints for projects/deliverables
2. Implement file upload (Cloudflare R2 or AWS S3)
3. Build dashboard UI for each role (Admin, PM, Consultant)

### Later
1. Deploy to production (Railway/Fly.io)
2. Set up CI/CD pipeline
3. Add monitoring (Sentry)

## 💡 Pro Tips

1. **Use Prisma Studio** - It's the easiest way to view/edit data
   ```bash
   npm run prisma:studio
   ```

2. **Check logs** - The console shows all notifications being sent
   ```bash
   npm run start:dev
   # Watch for: "Notification queued for user..."
   ```

3. **Test notifications** - Create a deliverable with a deadline 24 hours away
   ```bash
   # Via Prisma Studio or by building API endpoints
   ```

4. **Read the schema** - Understanding [prisma/schema.prisma](backend/prisma/schema.prisma) is key
   ```bash
   cat backend/prisma/schema.prisma
   ```

## 🆘 Getting Help

1. **Check the docs:**
   - [SETUP_GUIDE.md](SETUP_GUIDE.md) - Detailed setup
   - [backend/README.md](backend/README.md) - Backend docs
   - [ARCHITECTURE.md](ARCHITECTURE.md) - System design

2. **Common issues:**
   - Database: Check DATABASE_URL format
   - Redis: Ensure it's running (`redis-cli ping`)
   - Clerk: Verify both keys are set
   - Prisma: Run `npm run prisma:generate`

3. **Still stuck?**
   - Check the NestJS logs for error details
   - Verify all environment variables are set
   - Try `npm install` again

## ✅ Checklist

Before moving on, verify:

- [ ] Backend starts without errors (`npm run start:dev`)
- [ ] Database connected (see "✅ Database connected" in logs)
- [ ] Prisma Studio opens (http://localhost:5555)
- [ ] Health endpoint works (`curl localhost:4000/auth/health`)
- [ ] Test data exists (4 users, 2 projects in Prisma Studio)
- [ ] Redis working (`redis-cli ping` returns PONG)

## 🎉 You're Ready!

If all checks pass, you're ready to:
1. Start building API endpoints
2. Connect a frontend
3. Add more features

**The foundation is solid.** The database schema is complete, notifications work, and background jobs are running. Time to build on top of it!

---

**Questions?** Check the docs or review the code - it's well-commented! 🚀
