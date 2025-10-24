# OTCR Dashboard

A comprehensive dashboard for OTCR operations.

## Project Structure

```
otcr-dashboard/
├── backend/          # NextJS API + Prisma + PostgreSQL
├── frontend/         # React frontend (to be added)
├── docs/            # Documentation
└── README.md
```

## Backend (NextJS + Prisma + PostgreSQL)

The backend provides a REST API for user management and database operations.

### Features
- ✅ User CRUD operations
- ✅ PostgreSQL database with Prisma ORM
- ✅ TypeScript support
- ✅ Input validation with Zod
- ✅ Neon database integration

### API Endpoints
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `GET /api/users/[id]` - Get user by ID
- `PUT /api/users/[id]` - Update user
- `DELETE /api/users/[id]` - Delete user
- `GET /api/test-db` - Test database connection

### Getting Started

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your database URL and Clerk keys
   ```

4. Run database migrations:
   ```bash
   npm run db:push
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

## Frontend (Coming Soon)

The frontend will be built by the frontend team.

## Team Responsibilities

- **Backend**: Database and API setup (NextJS + Prisma)
- **Frontend**: React UI components and user interface
- **DevOps**: Deployment and infrastructure
- **QA**: Testing and quality assurance

## Development Workflow

1. Each team member works in their respective folder
2. Backend provides API endpoints for frontend consumption
3. Shared types and interfaces are defined in backend
4. Frontend consumes backend APIs

## Contributing

1. Create feature branches from main
2. Work in your designated folder (backend/ or frontend/)
3. Test your changes thoroughly
4. Submit pull requests for review

