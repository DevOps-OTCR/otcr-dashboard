# OTCR Dashboard

Internal dashboard for managing OTCR consulting projects, deliverables, deadlines, and team collaboration.

## 🏗 Architecture

This is a full-stack application with separated frontend and backend:

```
otcr-dashboard/
├── backend/          # NestJS API server
└── frontend/         # Next.js web application (coming soon)
```

## 🚀 Tech Stack

### Backend
- **Framework:** NestJS (TypeScript)
- **Database:** PostgreSQL (Neon)
- **ORM:** Prisma
- **Auth:** Clerk
- **Jobs:** BullMQ + Redis
- **Notifications:** Slack + Resend

### Frontend (Planned)
- **Framework:** Next.js 15
- **UI:** Tailwind CSS + shadcn/ui
- **Auth:** Clerk (Google SSO)
- **State:** React Query

## 📦 What's Included

### ✅ Completed Features

#### Ticket 1: Database Schema
- Complete Prisma schema with 8 models
- User management (Admin, PM, Consultant roles)
- Project and team assignment tracking
- Deliverable management with deadlines
- Submission workflow with versioning
- Extension request system with approval flow
- Time tracking
- Notification history

#### Ticket 2: Notifications & Background Jobs
- BullMQ job queue with Redis
- Slack webhook integration
- Email notifications via Resend
- Automated deadline reminders (24h, 1h)
- Extension request/response notifications
- Submission approval/rejection alerts
- Cron jobs for:
  - Hourly deadline checks
  - Daily PM summaries
  - Overdue status updates
  - Notification cleanup

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database ([Neon](https://neon.tech) recommended)
- Redis ([Upstash](https://upstash.com) for cloud, or local)
- [Clerk](https://clerk.com) account

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd otcr-dashboard
   ```

2. **Set up the backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your credentials
   npm run prisma:generate
   npm run prisma:push
   npm run prisma:seed
   npm run start:dev
   ```

   See [backend/README.md](backend/README.md) for detailed instructions.

3. **Set up the frontend** (coming soon)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## 📊 Database Schema Overview

```
User (Clerk-synced)
 └─ Projects (as PM)
     ├─ ProjectMembers (consultants)
     └─ Deliverables
         ├─ Submissions (versioned)
         └─ Extensions (approval workflow)
```

### Key Models
- **User**: ADMIN, PM, or CONSULTANT with Clerk integration
- **Project**: Active consulting engagements
- **Deliverable**: Work items with deadlines
- **Submission**: File uploads with approval workflow
- **Extension**: Deadline extension requests
- **Notification**: All notification history

## 🔔 Notification System

### Automatic Triggers
- **Deadline approaching**: 24h and 1h before due
- **Extension requested**: Alert PM
- **Extension decided**: Alert consultant
- **Submission reviewed**: Alert submitter

### Channels
- **Slack**: Instant team notifications
- **Email**: Official records via Resend

## 🛠 Development

### Backend Development
```bash
cd backend
npm run start:dev        # Start with hot reload
npm run prisma:studio    # Open database GUI
```

### Useful Commands
```bash
# Database
npm run prisma:migrate   # Create migration
npm run prisma:push      # Push schema changes
npm run prisma:seed      # Populate test data

# Testing
npm run test             # Run tests
```

## 📁 Repository Structure

```
otcr-dashboard/
├── backend/
│   ├── src/
│   │   ├── auth/              # Clerk authentication
│   │   ├── integrations/      # Slack, Email services
│   │   ├── notifications/     # Queue & processor
│   │   ├── jobs/              # Scheduled tasks
│   │   ├── prisma/            # Database module
│   │   └── common/            # Shared utilities
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.ts            # Test data
│   └── README.md
├── frontend/                   # (Coming soon)
└── README.md                   # This file
```

## 🌍 Environment Variables

### Backend `.env`
```env
DATABASE_URL=""              # PostgreSQL connection
CLERK_SECRET_KEY=""          # Clerk authentication
REDIS_URL=""                 # Redis for jobs
SLACK_WEBHOOK_URL=""         # Slack notifications
RESEND_API_KEY=""            # Email service
```

See [backend/.env.example](backend/.env.example) for full template.

## 🚢 Deployment

### Recommended Platforms
- **Backend**: Railway, Fly.io, or Render
- **Database**: Neon or Supabase
- **Redis**: Upstash
- **Frontend**: Vercel

### Production Checklist
- [ ] Set up production database (Neon)
- [ ] Configure production Redis (Upstash)
- [ ] Set up Clerk production keys
- [ ] Configure Slack webhook
- [ ] Set up Resend with verified domain
- [ ] Deploy backend to Railway/Fly.io
- [ ] Deploy frontend to Vercel
- [ ] Set up monitoring (Sentry)

## 👥 Team Roles

### Admin
- Full system access
- Manage all users and projects

### Project Manager (PM)
- Create and manage projects
- Assign consultants
- Approve/deny extensions
- Review submissions

### Consultant
- View assigned projects
- Submit deliverables
- Request extensions
- Log time

## 📝 API Documentation (Coming Soon)

Once the backend is running, API docs will be available at:
- Swagger UI: `http://localhost:4000/api`
- OpenAPI Spec: `http://localhost:4000/api-json`

## 🐛 Troubleshooting

### Database Issues
```bash
# Reset database
npx prisma migrate reset

# Check connection
npx prisma db pull
```

### Redis Issues
```bash
# Test local Redis
redis-cli ping

# Or use Upstash (cloud Redis)
```

### Build Issues
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
npm run prisma:generate
```

## 📚 Documentation

- [Backend README](backend/README.md) - Detailed backend setup
- [Prisma Schema](backend/prisma/schema.prisma) - Database structure
- [Tech Stack PDF](docs/Dashboard-Tech-Stack.pdf) - Original architecture

## 🎯 Next Steps

1. ✅ Database schema defined
2. ✅ Notification system implemented
3. 🔄 Build frontend (Next.js + Tailwind)
4. 🔄 Implement file upload (R2/S3)
5. 🔄 Add CRUD API endpoints
6. 🔄 Deploy to production

## 🆘 Support

For questions or issues:
1. Check the [backend/README.md](backend/README.md)
2. Review the [prisma schema](backend/prisma/schema.prisma)
3. Ask the team in Slack

## 📄 License

Private - OTCR Internal Use Only

---

**Status**: Backend Complete ✅ | Frontend In Progress 🔄
