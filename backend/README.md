# OTCR Dashboard - Backend

NestJS backend server for the OTCR Dashboard with database management, authentication, and background job processing.

## 🏗 Tech Stack

- **Framework:** NestJS (Node.js + TypeScript)
- **Database:** PostgreSQL (via Neon or Supabase)
- **ORM:** Prisma
- **Authentication:** Clerk
- **Job Queue:** BullMQ + Redis
- **Notifications:** Slack Webhooks + Resend (Email)
- **File Storage:** Cloudflare R2 / AWS S3

## 📋 Prerequisites

Before running this project, ensure you have:

- Node.js (v18 or higher)
- npm or yarn
- PostgreSQL database (we recommend [Neon](https://neon.tech))
- Redis instance (local or [Upstash](https://upstash.com))
- Clerk account for authentication
- (Optional) Slack workspace for notifications
- (Optional) Resend account for email notifications

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Then fill in your credentials in `.env`:

```env
# Database (Get from Neon.tech or Supabase)
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"

# Authentication (Get from clerk.com)
CLERK_SECRET_KEY="sk_test_..."
CLERK_PUBLISHABLE_KEY="pk_test_..."

# Redis (Local or Upstash)
REDIS_URL="redis://localhost:6379"

# Notifications (Optional but recommended)
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
RESEND_API_KEY="re_..."
EMAIL_FROM="notifications@otcr.com"
```

### 3. Set Up Database

Generate Prisma client:

```bash
npm run prisma:generate
```

Push the schema to your database:

```bash
npm run prisma:push
```

Or create a migration:

```bash
npm run prisma:migrate
```

### 4. Seed Database (Optional)

Populate with test data:

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

### 5. Start the Server

Development mode (with hot reload):

```bash
npm run start:dev
```

Production mode:

```bash
npm run build
npm run start:prod
```

The server will start on `http://localhost:4000`

## 📁 Project Structure

```
backend/
├── src/
│   ├── auth/                    # Authentication module (Clerk integration)
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── integrations/            # External service integrations
│   │   ├── slack.service.ts     # Slack webhook notifications
│   │   └── email.service.ts     # Email via Resend
│   ├── notifications/           # Notification system
│   │   ├── notifications.service.ts    # Queue management
│   │   ├── notifications.processor.ts  # Job worker
│   │   └── notifications.module.ts
│   ├── jobs/                    # Scheduled jobs
│   │   └── deadline-scheduler.service.ts
│   ├── prisma/                  # Database module
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── common/                  # Shared utilities
│   │   └── redis.config.ts
│   ├── app.module.ts            # Root module
│   └── main.ts                  # Application entry point
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── seed.ts                  # Database seeder
├── .env                         # Environment variables (not in git)
├── .env.example                 # Environment template
├── package.json
└── README.md
```

## 🗄 Database Schema

The database includes these main entities:

### Core Tables
- **User** - User accounts (synced with Clerk)
- **Project** - Consulting projects
- **ProjectMember** - Project team assignments
- **Deliverable** - Project deliverables with deadlines
- **Submission** - File submissions for deliverables
- **Extension** - Extension requests with approval workflow
- **TimeEntry** - Time tracking (optional)
- **Notification** - Notification history

### Enums
- **Role**: ADMIN, PM, CONSULTANT
- **ProjectStatus**: ACTIVE, COMPLETED, ON_HOLD, CANCELLED
- **DeliverableStatus**: PENDING, IN_PROGRESS, SUBMITTED, APPROVED, OVERDUE
- **SubmissionStatus**: PENDING_REVIEW, APPROVED, REJECTED, REQUIRES_RESUBMISSION
- **ExtensionStatus**: PENDING, APPROVED, DENIED, WITHDRAWN
- **NotificationType**: DEADLINE_REMINDER, EXTENSION_REQUEST, etc.

## 🔔 Notification System

The notification system uses BullMQ with Redis for reliable background job processing.

### Automatic Notifications

1. **Deadline Reminders**
   - 24 hours before deadline
   - 1 hour before deadline
   - Sent via Slack and/or Email

2. **Extension Requests**
   - Notifies PM when consultant requests extension
   - Notifies consultant when request is approved/denied

3. **Submission Status**
   - Notifies consultant when submission is approved/rejected

### Scheduled Jobs

- **Every Hour**: Check for upcoming deadlines and mark overdue
- **Daily at 9 AM**: Send summary to PMs
- **Daily at Midnight**: Clean up old notifications (30+ days)

## 🔧 Available Scripts

```bash
# Development
npm run start:dev          # Start dev server with hot reload
npm run start:debug        # Start with debugging enabled

# Build & Production
npm run build              # Build for production
npm run start:prod         # Run production build

# Database
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Create and run migration
npm run prisma:push        # Push schema without migration
npm run prisma:studio      # Open Prisma Studio GUI
npm run prisma:seed        # Seed database with test data

# Testing
npm run test               # Run tests
```

## 🔐 Authentication

The backend uses Clerk for authentication. Users sign in via the frontend (Next.js), and the backend verifies JWT tokens.

### Endpoints

- `GET /auth/me` - Get current user (requires Bearer token)
- `GET /auth/health` - Health check

### Usage Example

```typescript
// Frontend sends request with token
const response = await fetch('http://localhost:4000/auth/me', {
  headers: {
    'Authorization': `Bearer ${clerkToken}`
  }
});
```

The backend will:
1. Verify the token with Clerk
2. Sync user data with database
3. Return user object with role

## 📊 Database Management

### View Database

```bash
npm run prisma:studio
```

Opens a GUI at `http://localhost:5555` to view/edit data.

### Reset Database

```bash
npx prisma migrate reset
```

This will:
1. Drop all tables
2. Run migrations
3. Run seed script

### Create Migration

After changing `schema.prisma`:

```bash
npm run prisma:migrate
```

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Test your DATABASE_URL
npx prisma db pull
```

If it fails, check:
- DATABASE_URL format is correct
- Database is accessible from your machine
- SSL mode is set correctly (usually `?sslmode=require` for cloud DBs)

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli ping
```

Should return `PONG`. If not:
- Check Redis is running: `redis-server`
- Or use Upstash Redis (cloud)

### Prisma Client Issues

```bash
# Regenerate Prisma client
npm run prisma:generate
```

## 🚢 Deployment

### Recommended Platforms

- **Railway** - Easiest deployment with automatic setup
- **Fly.io** - Good for long-running workers
- **Render** - Free tier available
- **AWS/GCP** - For production scale

### Environment Setup

Ensure these are set in production:

```env
NODE_ENV=production
DATABASE_URL=...          # Production database
REDIS_URL=...            # Production Redis
CLERK_SECRET_KEY=...     # Production Clerk key
SLACK_WEBHOOK_URL=...
RESEND_API_KEY=...
```

## 📚 Next Steps

1. **Set up frontend** - Connect Next.js frontend to this backend
2. **Configure file storage** - Set up R2/S3 for deliverable uploads
3. **Add more endpoints** - Build CRUD operations for projects, deliverables
4. **Set up CI/CD** - Automate testing and deployment
5. **Add monitoring** - Set up Sentry or similar for error tracking

## 🆘 Getting Help

- **Prisma Issues**: [Prisma Documentation](https://www.prisma.io/docs)
- **NestJS Questions**: [NestJS Documentation](https://docs.nestjs.com)
- **Clerk Auth**: [Clerk Documentation](https://clerk.com/docs)
- **BullMQ Jobs**: [BullMQ Documentation](https://docs.bullmq.io)

## ✅ Completed Features

### Ticket 1: Database Schema ✅
- [x] Complete Prisma schema with all models
- [x] User management with Clerk integration
- [x] Project and deliverable tracking
- [x] Extension request workflow
- [x] Submission versioning
- [x] Time tracking
- [x] Notification history

### Ticket 2: Notifications & Background Jobs ✅
- [x] BullMQ queue setup with Redis
- [x] Slack webhook integration
- [x] Resend email integration
- [x] Deadline reminder system (24h, 1h)
- [x] Extension request notifications
- [x] Submission approval notifications
- [x] Scheduled cron jobs for automation
- [x] Notification processor with retry logic
- [x] Database logging of all notifications

## 📝 License

Private - OTCR Internal Use Only
