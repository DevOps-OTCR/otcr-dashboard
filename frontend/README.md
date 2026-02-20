# OTCR Dashboard - Frontend

Modern Next.js 15 dashboard with role-based access control, file uploads, and time tracking.

## ✨ Features

✅ **Dual Dashboards** - PM and Consultant perspectives
✅ **Authentication** - NextAuth with Google OAuth
✅ **Role-Based UI** - Adapts based on user email
✅ **Responsive Design** - Mobile-first with Tailwind CSS
✅ **Modern Stack** - Next.js 15 + React 19 + TypeScript

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create `.env.local`:

```env
# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# NextAuth
NEXTAUTH_SECRET=your-random-secret  # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:4000

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📂 Structure

```
frontend/
├── app/
│   ├── dashboard/           # Main dashboard (role-based)
│   ├── sign-in/             # Authentication pages
│   ├── sign-up/
│   ├── layout.tsx           # Root layout with SessionProvider
│   ├── page.tsx             # Home (redirects)
│   └── globals.css          # Tailwind + custom styles
├── components/              # Reusable components
│   ├── ui/                  # UI primitives
│   ├── dashboard/           # Dashboard components
│   └── projects/            # Project components
├── lib/
│   └── api.ts               # API client
├── middleware.ts            # NextAuth auth middleware
└── package.json
```

## 🎨 Dashboard Views

### PM Dashboard
- Total projects, active consultants, pending approvals
- Quick actions: Review submissions, approve extensions
- Recent activity feed
- Team performance metrics

### Consultant Dashboard
- Active projects, hours logged, pending deliverables
- Quick actions: Upload files, log time, request extension
- Upcoming deadlines (with urgency indicators)
- Recent work history

## 🔐 Authentication

Uses NextAuth with:
- Google OAuth only
- Email-based role assignment (AllowedEmail table)
- Protected routes via middleware

**Role Mapping:**
- `lsharma2@illinois.edu` → PM
- `admin@otcr.com` → ADMIN
- All others → CONSULTANT

## 🛠 Tech Stack

- **Next.js 15** - React framework with App Router
- **React 19** - Latest React features
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **NextAuth** - Authentication (Google OAuth)
- **Lucide React** - Icons
- **Axios** - HTTP client
- **date-fns** - Date formatting

## 📡 API Integration

API client in `lib/api.ts` provides:

```typescript
// Authentication
authAPI.getCurrentUser()
authAPI.health()

// Projects
projectsAPI.getAll()
projectsAPI.create(data)

// Deliverables
deliverablesAPI.getByProject(id)
deliverablesAPI.create(data)

// Submissions
submissionsAPI.create(deliverableId, data)
submissionsAPI.approve(id, feedback)

// Extensions
extensionsAPI.request(deliverableId, data)
extensionsAPI.approve(id, notes)

// Time Tracking
timeTrackingAPI.log(data)
timeTrackingAPI.getByUser(userId)
```

## 🎯 What's Implemented

✅ Authentication flow with NextAuth
✅ Role-based dashboard switching
✅ PM dashboard with stats and actions
✅ Consultant dashboard with deadlines
✅ Responsive layouts
✅ API client ready to use
✅ Protected routes

## 🚧 What's Next

These features need component implementation:

1. **File Upload** - Drag-and-drop with react-dropzone
2. **Time Tracking Form** - Log hours by project
3. **Project Management** - CRUD for projects
4. **Deliverable Submission** - Upload and track files
5. **Extension Requests** - Request and approve extensions
6. **Real API Integration** - Connect to backend endpoints

## 🔧 Development

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm run start

# Linting
npm run lint
```

## 🎨 Styling

Uses Tailwind CSS with custom utilities:

```css
.glass - Glass-morphism effect
animate-fade-in - Fade in animation
animate-slide-up - Slide up animation
```

## 📝 Adding Features

### Add a New Page

1. Create `app/your-page/page.tsx`
2. Add route to navigation
3. Implement component

### Add API Endpoint

1. Update `lib/api.ts`
2. Add to appropriate API object
3. Use in components

### Add Component

1. Create in `components/` directory
2. Import and use in pages
3. Style with Tailwind

## ⚡ Performance

- Server Components by default
- Client Components only when needed
- Automatic code splitting
- Optimized images

## 🐛 Troubleshooting

### "NextAuth / OAuth errors"
Ensure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET` are set in `.env.local`

### "API connection failed"
Ensure backend is running on port 4000

### "Module not found"
Run `npm install` again

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth Documentation](https://authjs.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)

## ✅ Checklist

Before running:
- [ ] Install dependencies (`npm install`)
- [ ] Create `.env.local` with Google OAuth and NextAuth keys
- [ ] Start backend server (port 4000)
- [ ] Run `npm run dev`
- [ ] Open localhost:3000

---

**Status**: Core structure complete. Ready for feature implementation.
