# OTCR Dashboard

A modern full-stack internal dashboard for **OTCR (Consulting Platform)** built with cutting-edge technologies for managing consulting projects, team collaboration, and performance analytics.

## 🏗️ Architecture

**Frontend:** Next.js 16 • React 19 • TypeScript • Tailwind CSS v4 • Clerk Authentication  
**Backend:** NestJS • Node.js • TypeScript

## ✨ Features

### 👥 Role-Based Access
- **Manager Dashboard:** Team overview, project approvals, resource allocation, performance analytics  
- **Consultant Dashboard:** Personal projects, time tracking, deliverables, performance metrics  

### 🔐 Authentication
- Secure login/signup with Google OAuth  
- Role-based permissions (Manager vs Consultant)  
- Session management powered by Clerk  

### 📊 Dashboard Capabilities
- Real-time project tracking  
- Team utilization metrics  
- Performance analytics  
- Quick actions for common tasks  

### 🎨 Modern UI/UX
- Responsive design using Tailwind CSS v4  
- Glass-morphism styling  
- Smooth animations & transitions  
- Mobile-first layout  

## 🚀 Getting Started

### Prerequisites
- Node.js 18+  
- npm or yarn  
- Git  

### Installation

#### 1. Clone the repository
git clone <your-repo-url>  
cd otcr-dashboard

#### 2. Environment Setup
# Copy environment template  
cp .env.example .env.local  

# Fill in your env variables:  
# - Clerk API keys  
# - Database connection strings  
# - Other secrets

#### 3. Install Dependencies

Frontend  
cd frontend  
npm install  

Backend  
cd ../backend  
npm install  

#### 4. Start Development Servers

Frontend  
cd frontend  
npm run dev  

Backend  
cd backend  
npm run start:dev  

#### 5. Open in browser
- Frontend: http://localhost:3000  
- Backend API: http://localhost:3001  

## 📁 Project Structure

otcr-dashboard/  
├── backend/                    # NestJS API Server  
│   ├── src/  
│   │   ├── app.controller.ts  
│   │   ├── app.service.ts  
│   │   └── auth/               # Authentication module  
│   ├── package.json  
│   └── tsconfig.json  
├── frontend/                   # Next.js React App  
│   ├── app/                    # Next.js App Router  
│   │   ├── dashboard/          # Protected dashboard pages  
│   │   ├── sign-in/            # Authentication pages  
│   │   ├── sign-up/  
│   │   ├── layout.tsx          # Root layout  
│   │   └── globals.css         # Tailwind CSS  
│   ├── components/             # Reusable components  
│   ├── package.json  
│   └── tailwind.config.ts  
├── .gitignore                  # Git ignore rules  
├── .env.local                  # Environment variables (ignored)  
└── README.md
