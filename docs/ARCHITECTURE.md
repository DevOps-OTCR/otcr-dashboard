# OTCR Dashboard Architecture

## 🏗 System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OTCR Dashboard                               │
│                                                                      │
│  ┌──────────────┐         ┌──────────────┐         ┌─────────────┐ │
│  │   Frontend   │◄────────┤   Backend    │◄────────┤  Database   │ │
│  │  (Next.js)   │  HTTP   │   (NestJS)   │  Prisma │ (PostgreSQL)│ │
│  │              │         │              │         │             │ │
│  │  • Dashboard │         │  • REST API  │         │  • Users    │ │
│  │  • Auth UI   │         │  • WebSockets│         │  • Projects │ │
│  │  • File      │         │  • Jobs      │         │  • Notifs   │ │
│  │    Upload    │         │  • Auth      │         │             │ │
│  └──────┬───────┘         └──────┬───────┘         └─────────────┘ │
│         │                        │                                  │
│         │                        │                                  │
│         └────────┐      ┌────────┴─────────┐                       │
│                  │      │                  │                       │
│           ┌──────▼──────▼──┐        ┌─────▼─────┐                 │
│           │     Google      │        │   Redis   │                 │
│           │ Authentication  │        │ Job Queue │                 │
│           │  (Google SSO)   │        │  (BullMQ) │                 │
│           └─────────────────┘        └─────┬─────┘                 │
│                                            │                        │
│                              ┌─────────────┴──────────┐            │
│                              │                        │            │
│                       ┌──────▼──────┐         ┌──────▼──────┐     │
│                       │    Slack    │         │   Resend    │     │
│                       │ Webhooks    │         │    Email    │     │
│                       └─────────────┘         └─────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow

### 1. User Authentication Flow
```
User → Frontend → Clerk → Backend → Database
  │                │         │          │
  1. Click login   │         │          │
  │                2. Google SSO        │
  │                │         │          │
  │                3. Get JWT token     │
  │                │         │          │
  4. ←────────────┘          │          │
  │                          │          │
  5. Request with Bearer token          │
  │                          6. Verify token
  │                          │          │
  │                          7. Sync user data
  │                          │          │
  8. ←──────────────────────┴──────────┘
  │
  User authenticated ✓
```

### 2. Notification Flow
```
Event Trigger → Service → Queue → Processor → Delivery
     │             │        │         │           │
     │             │        │         │           ├─→ Slack
     │             │        │         │           └─→ Email
     │             │        │         │
     1. Deadline   │        │         │
        approaching │        │         │
     │             2. Create job       │
     │             │        │         │
     │             3. Add to Redis     │
     │                      │         │
     │                      4. Worker picks up
     │                      │         │
     │                      │         5. Send notification
     │                               │
     │                               6. Update DB status
     │                               │
     └───────────────────────────────┘
```

### 3. Deadline Reminder System
```
Cron Job (Hourly)
     │
     ├─→ Query deliverables due in 48h
     │        │
     │        ├─→ For each deliverable:
     │        │      │
     │        │      ├─→ Calculate hours until deadline
     │        │      │
     │        │      ├─→ If 23-25 hours → Schedule 24h reminder
     │        │      │
     │        │      └─→ If 0.5-1.5 hours → Schedule 1h reminder
     │        │
     │        └─→ Add jobs to BullMQ queue
     │
     └─→ Mark overdue deliverables
```

## 📊 Database Schema (ERD)

```
┌─────────────────┐
│      User       │
│─────────────────│
│ id (PK)         │
│ OAuth (UQ)    │◄──────────┐
│ email (UQ)      │           │
│ role (ENUM)     │           │
│ ...             │           │
└────────┬────────┘           │
         │                    │
         │ PM                 │
         │                    │
         ▼                    │
┌─────────────────┐           │
│    Project      │           │
│─────────────────│           │
│ id (PK)         │           │
│ pmId (FK) ──────┤           │
│ name            │           │
│ status          │           │
└────────┬────────┘           │
         │                    │
         │                    │
         ▼                    │
┌─────────────────┐           │
│  Deliverable    │           │
│─────────────────│           │
│ id (PK)         │           │
│ projectId (FK)  │           │
│ deadline        │           │
│ status          │           │
└────┬───────┬────┘           │
     │       │                │
     │       └────────────┐   │
     │                    │   │
     ▼                    ▼   │
┌──────────┐        ┌──────────────┐
│Submission│        │  Extension   │
│──────────│        │──────────────│
│ id (PK)  │        │ id (PK)      │
│ delivId  │        │ delivId (FK) │
│ userId ──┼────────┤ requestedBy ─┤
│ fileUrl  │        │ approvedBy ──┤
│ status   │        │ status       │
└──────────┘        └──────────────┘
     │
     │ (self-ref for versioning)
     │
     ▼
┌──────────┐
│Submission│ (previous version)
└──────────┘

┌──────────────────┐
│  Notification    │
│──────────────────│
│ id (PK)          │
│ userId (FK) ─────┤
│ type (ENUM)      │
│ channel (ENUM)   │
│ status (ENUM)    │
└──────────────────┘

┌──────────────────┐
│  ProjectMember   │
│──────────────────│
│ projectId (FK)   │
│ userId (FK) ─────┤
│ joinedAt         │
│ leftAt           │
└──────────────────┘

┌──────────────────┐
│   TimeEntry      │
│──────────────────│
│ id (PK)          │
│ userId (FK) ─────┤
│ date             │
│ hours            │
└──────────────────┘
```

## 🔔 Notification Types & Triggers

```
┌─────────────────────────────────────────────────────────────┐
│                    Notification System                       │
└─────────────────────────────────────────────────────────────┘

TRIGGER                          TYPE                  RECIPIENTS
──────────────────────────────────────────────────────────────
Deadline in 24h              → DEADLINE_24H         → Consultants
Deadline in 1h               → DEADLINE_1H          → Consultants
Consultant requests extension → EXTENSION_REQUEST   → PM
PM approves extension        → EXTENSION_APPROVED   → Consultant
PM denies extension          → EXTENSION_DENIED     → Consultant
Consultant submits file      → (optional alert)     → PM
PM approves submission       → SUBMISSION_APPROVED  → Consultant
PM rejects submission        → SUBMISSION_REJECTED  → Consultant
User added to project        → PROJECT_ASSIGNED     → Consultant
Deliverable overdue          → OVERDUE_ALERT        → PM + Consultant

CHANNELS
────────
• Slack: Instant notifications to team channels
• Email: Formal records with HTML templates
• Both:  Critical notifications use both channels
```

## ⏰ Scheduled Jobs (Cron)

```
SCHEDULE          JOB                           ACTION
─────────────────────────────────────────────────────────────
Every Hour        Check Deadlines               • Find deliverables due in 48h
                                               • Schedule 24h and 1h reminders
                                               • Add jobs to BullMQ queue

Every Hour        Mark Overdue                  • Find deliverables past deadline
                                               • Update status to OVERDUE
                                               • Send alerts

Daily at 9 AM     PM Summary                    • Count active deliverables
                                               • Count overdue items
                                               • Send summary email to PMs

Daily at Midnight Cleanup Notifications         • Delete notifications older than 30 days
                                               • Keep database lean
```

## 🔧 NestJS Module Structure

```
AppModule (root)
├── ConfigModule (global)
│   └── Loads .env variables
│
├── ScheduleModule (global)
│   └── Enables @Cron decorators
│
├── PrismaModule (global)
│   ├── PrismaService
│   └── Database connection
│
├── AuthModule
│   ├── AuthController
│   │   ├── GET /auth/me
│   │   └── GET /auth/health
│   └── AuthService
│       ├── verifyToken()
│       ├── getUserFromClerk()
│       └── syncUserWithDatabase()
│
└── NotificationsModule
    ├── NotificationsService
    │   ├── queueNotification()
    │   ├── scheduleDeadlineReminder()
    │   ├── sendExtensionRequest()
    │   ├── sendExtensionResponse()
    │   └── sendSubmissionResponse()
    │
    ├── NotificationsProcessor
    │   ├── BullMQ Worker
    │   ├── processNotification()
    │   ├── sendSlackNotification()
    │   └── sendEmailNotification()
    │
    ├── SlackService
    │   ├── sendMessage()
    │   ├── sendDeadlineReminder()
    │   ├── sendExtensionRequest()
    │   └── send...() [7 methods]
    │
    ├── EmailService
    │   ├── sendEmail()
    │   ├── sendDeadlineReminder()
    │   ├── sendExtensionApproved()
    │   └── send...() [6 methods]
    │
    └── DeadlineSchedulerService
        ├── @Cron checkUpcomingDeadlines()
        ├── @Cron markOverdueDeliverables()
        ├── @Cron sendDailySummaryToPMs()
        └── @Cron cleanupOldNotifications()
```

## 🚀 Request/Response Flow

### Example: User submits a deliverable

```
1. Frontend
   POST /api/deliverables/{id}/submit
   Headers: Authorization: Bearer {clerkToken}
   Body: { fileUrl: "...", fileName: "..." }

2. Backend (AuthGuard)
   ├─→ Extract Bearer token
   ├─→ Verify with Clerk
   └─→ Load user from database

3. Backend (SubmissionsController)
   ├─→ Validate request body
   ├─→ Check if deliverable exists
   └─→ Call SubmissionsService

4. Backend (SubmissionsService)
   ├─→ Create Submission record
   │   ├─→ Check if late (compare to deadline)
   │   ├─→ Set version number
   │   └─→ Link to previous submission (if exists)
   │
   └─→ Trigger notification
       └─→ NotificationsService.queueNotification()

5. BullMQ Queue
   ├─→ Add job to Redis
   └─→ Job ID: "submission-{id}"

6. Notification Processor (async)
   ├─→ Pick up job from queue
   ├─→ Load user data
   ├─→ Send to PM:
   │   ├─→ Slack: "New submission from {user}"
   │   └─→ Email: "Submission received notification"
   │
   └─→ Update Notification status in DB

7. Response to Frontend
   {
     "success": true,
     "submission": {
       "id": "...",
       "status": "PENDING_REVIEW",
       "submittedAt": "2025-01-15T10:30:00Z"
     }
   }
```

## 🔐 Authentication & Authorization

```
┌──────────────────────────────────────────────────────────┐
│                   Auth Flow (Clerk)                       │
└──────────────────────────────────────────────────────────┘

Frontend                    Backend                  Database
────────                    ───────                  ────────
User clicks login
   │
   └─→ Redirect to Clerk
           │
   ┌───────┘
   │
Google OAuth flow
   │
   └─→ Receive JWT token
           │
   ┌───────┘
   │
Store token in cookies
   │
Make API request
with Bearer token ──→ AuthGuard intercepts
                          │
                    Verify JWT with Clerk
                          │
                    Extract clerkId ────→ Find/Create User
                          │                     │
                    Load user data ←────────────┘
                          │
                    Attach user to request
                          │
                    Call controller ──→ Handle request
                                             │
Response with data ←─────────────────────────┘
```

## 📦 Environment Configuration

```
Development                    Production
───────────                    ──────────
DATABASE_URL                   DATABASE_URL
  → Local PostgreSQL             → Neon.tech

REDIS_URL                      REDIS_URL
  → redis://localhost:6379       → Upstash Redis

CLERK_SECRET_KEY               CLERK_SECRET_KEY
  → sk_test_...                  → sk_live_...

SLACK_WEBHOOK_URL              SLACK_WEBHOOK_URL
  → Test channel                 → Production channel

RESEND_API_KEY                 RESEND_API_KEY
  → Test API key                 → Production API key
```

## 🎯 Scalability Considerations

### Current Architecture (MVP)
```
Single NestJS Instance
    ├─→ Handles HTTP requests
    ├─→ Processes background jobs
    └─→ Runs cron jobs
```

### Future Scalability
```
Load Balancer
    │
    ├─→ API Server 1 (no jobs)
    ├─→ API Server 2 (no jobs)
    └─→ API Server 3 (no jobs)

Separate Worker Server
    ├─→ BullMQ processors only
    ├─→ Processes notification jobs
    └─→ Can scale horizontally

Separate Scheduler
    └─→ Single instance running cron jobs
        (prevents duplicate scheduled tasks)
```

## 📊 Monitoring & Observability

```
┌─────────────────────────────────────────────┐
│            Monitoring Stack                  │
└─────────────────────────────────────────────┘

Application Logs
  └─→ NestJS Logger → Console/File

Error Tracking (Future)
  └─→ Sentry
      ├─→ Captures exceptions
      ├─→ Performance monitoring
      └─→ Release tracking

Job Monitoring
  └─→ BullMQ Dashboard (optional)
      ├─→ View queue status
      ├─→ Retry failed jobs
      └─→ Performance metrics

Database Monitoring
  └─→ Prisma Studio
      └─→ GUI for data inspection

Uptime Monitoring (Production)
  └─→ Uptime Robot or similar
      └─→ Health check endpoints
```

---
