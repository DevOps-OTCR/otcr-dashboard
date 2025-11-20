"use client";

import { useAuth, useUser, SignOutButton } from "@clerk/nextjs";
import { useState } from "react";

// Header Component (inline)
function Header() {
  const { user, isLoaded } = useUser();

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg">O</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">OTCR</h1>
              <p className="text-xs text-gray-500 font-medium">Consulting Platform</p>
            </div>
          </div>

          {/* User Menu */}
          {isLoaded && user && (
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-gray-500">{user.primaryEmailAddress?.emailAddress}</p>
              </div>
              <SignOutButton>
                <button className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors px-3 py-2 rounded-md hover:bg-gray-100">
                  Sign Out
                </button>
              </SignOutButton>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// Define user roles based on email
const CONSULTANT_EMAILS = [
  "vrome@illinois.edu",
  "darshvs2@illinois.edu",
  "yjagtap2@illinois.edu",
  "tejavk2@illinois.edu",
  "sharngi2@illinois.edu",
  "kona3@illinois.edu",
  "crawat2@illinois.edu",
  "bchar@illinois.edu"
];

const MANAGER_EMAILS = ["lsharma2@illinois.edu"];

type UserRole = "consultant" | "manager";

function getUserRole(email: string): UserRole {
  if (MANAGER_EMAILS.includes(email)) return "manager";
  if (CONSULTANT_EMAILS.includes(email)) return "consultant";
  return "consultant";
}

/* -------------------------------------------------------
   Summary Card
------------------------------------------------------- */
function SummaryCard({ title, value, subtitle }: any) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{title}</h3>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
    </div>
  );
}

/* -------------------------------------------------------
   Recent Activity Table
------------------------------------------------------- */
function ActivityTable() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
      </div>
      <div className="px-6 py-4">
        <div className="text-sm text-gray-500">No recent activity</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Quick Actions
------------------------------------------------------- */
function QuickActions() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">Test Backend</div>
          <div className="text-xs text-gray-600 mt-1">Check system connection</div>
        </button>
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">New Project</div>
          <div className="text-xs text-gray-600 mt-1">Start a new engagement</div>
        </button>
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">Schedule Meeting</div>
          <div className="text-xs text-gray-600 mt-1">Book client time</div>
        </button>
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">View Reports</div>
          <div className="text-xs text-gray-600 mt-1">Access analytics</div>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Manager Stats Grid
------------------------------------------------------- */
function ManagerStatsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <SummaryCard title="Total Consultants" value="8" subtitle="Active team members" />
      <SummaryCard title="Active Projects" value="12" subtitle="Currently in progress" />
      <SummaryCard title="Team Utilization" value="87%" subtitle="Average across team" />
      <SummaryCard title="Revenue This Month" value="$42.5K" subtitle="Team contribution" />
    </div>
  );
}

/* -------------------------------------------------------
   Consultant Stats Grid
------------------------------------------------------- */
function ConsultantStatsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <SummaryCard title="My Active Projects" value="3" subtitle="Currently assigned" />
      <SummaryCard title="Hours This Month" value="42" subtitle="Logged this month" />
      <SummaryCard title="Completed Tasks" value="15" subtitle="This week" />
      <SummaryCard title="Performance Score" value="94%" subtitle="Based on metrics" />
    </div>
  );
}

/* -------------------------------------------------------
   Manager Actions
------------------------------------------------------- */
function ManagerActions() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Management Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">Team Overview</div>
          <div className="text-xs text-gray-600 mt-1">View consultant performance</div>
        </button>
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">Project Approvals</div>
          <div className="text-xs text-gray-600 mt-1">Review and approve projects</div>
        </button>
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">Resource Allocation</div>
          <div className="text-xs text-gray-600 mt-1">Assign consultants to projects</div>
        </button>
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">Generate Reports</div>
          <div className="text-xs text-gray-600 mt-1">Team and project analytics</div>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Consultant Actions
------------------------------------------------------- */
function ConsultantActions() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">My Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">My Projects</div>
          <div className="text-xs text-gray-600 mt-1">View assigned projects</div>
        </button>
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">Log Time</div>
          <div className="text-xs text-gray-600 mt-1">Record project hours</div>
        </button>
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">Submit Deliverables</div>
          <div className="text-xs text-gray-600 mt-1">Upload completed work</div>
        </button>
        <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="text-sm font-medium text-gray-900">Request Time Off</div>
          <div className="text-xs text-gray-600 mt-1">Schedule PTO</div>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Manager Activity Table
------------------------------------------------------- */
function ManagerActivityTable() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">Team Activity</h2>
      </div>
      <div className="px-6 py-4">
        <div className="text-sm text-gray-500">Recent team updates and project milestones</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const userRole = user?.primaryEmailAddress?.emailAddress ? getUserRole(user.primaryEmailAddress.emailAddress) : "consultant";

  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const isManager = userRole === "manager";

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {user?.firstName || 'User'}!
          </h1>
          <p className="text-gray-600">
            {isManager ? "Manager Dashboard" : "Consultant Dashboard"}
          </p>
        </div>

        {/* Role-specific Stats */}
        {isManager ? <ManagerStatsGrid /> : <ConsultantStatsGrid />}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {isManager ? <ManagerActivityTable /> : <ActivityTable />}
          {isManager ? <ManagerActions /> : <ConsultantActions />}
        </div>
      </main>
    </div>
  );
}
