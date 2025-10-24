# Backend - OTCR Dashboard

NextJS API with Prisma and PostgreSQL for OTCR dashboard backend services.

## Tech Stack
- **Framework**: NextJS 16 with App Router
- **Database**: PostgreSQL (Neon)
- **ORM**: Prisma
- **Language**: TypeScript
- **Validation**: Zod
- **Authentication**: Clerk (pending)

## Project Structure
```
backend/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── users/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   └── test-db/route.ts
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── lib/
│   │   ├── prisma.ts
│   │   └── test-db.ts
│   └── types/
│       └── user.ts
├── prisma/
│   └── schema.prisma
├── package.json
├── tsconfig.json
└── .env
```

## Database Schema

### User Model
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      String   @default("user")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## API Endpoints

### Users
- `GET /api/users` - Get all users (with pagination)
- `POST /api/users` - Create a new user
- `GET /api/users/[id]` - Get user by ID
- `PUT /api/users/[id]` - Update user
- `DELETE /api/users/[id]` - Delete user

### System
- `GET /api/test-db` - Test database connection

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your database URL
   ```

3. **Set up database**:
   ```bash
   npm run db:push
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Test the API**:
   ```bash
   curl http://localhost:3000/api/test-db
   curl http://localhost:3000/api/users
   ```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Run migrations
- `npm run db:studio` - Open Prisma Studio

## Environment Variables

```bash
# Database
DATABASE_URL="postgresql://username:password@host/database?sslmode=require"

# Clerk Authentication (pending)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
```

## Next Steps

1. ✅ Database connection established
2. ✅ User CRUD API implemented
3. ⚠️ Integrate Clerk authentication
4. ⚠️ Add API documentation
5. ⚠️ Add error logging
6. ⚠️ Add rate limiting
7. ⚠️ Add API versioning

