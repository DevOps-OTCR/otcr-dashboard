'use client';

import { useUser, UserButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Clock,
  FileText,
  Users,
  TrendingUp,
  Upload,
  Calendar,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

// Determine role based on email
function getUserRole(email: string): 'PM' | 'CONSULTANT' | 'ADMIN' {
  const pmEmails = ['lsharma2@illinois.edu'];
  const adminEmails = ['admin@otcr.com'];

  if (adminEmails.includes(email)) return 'ADMIN';
  if (pmEmails.includes(email)) return 'PM';
  return 'CONSULTANT';
}

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const [role, setRole] = useState<'PM' | 'CONSULTANT' | 'ADMIN'>('CONSULTANT');

  useEffect(() => {
    if (user?.primaryEmailAddress?.emailAddress) {
      setRole(getUserRole(user.primaryEmailAddress.emailAddress));
    }
  }, [user]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <LayoutDashboard className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">OTCR Dashboard</h1>
                <p className="text-sm text-gray-600">
                  Welcome back, {user?.firstName || user?.emailAddresses[0]?.emailAddress}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {role}
              </span>
              <UserButton afterSignOutUrl="/sign-in" />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        {role === 'PM' ? <PMDashboard /> : <ConsultantDashboard />}
      </div>
    </div>
  );
}

function PMDashboard() {
  const stats = [
    { label: 'Total Projects', value: '12', icon: FolderKanban, color: 'blue' },
    { label: 'Active Consultants', value: '24', icon: Users, color: 'green' },
    { label: 'Pending Approvals', value: '5', icon: AlertCircle, color: 'yellow' },
    { label: 'Completed This Month', value: '18', icon: CheckCircle2, color: 'purple' },
  ];

  const quickActions = [
    { label: 'Review Submissions', icon: FileText, href: '/deliverables' },
    { label: 'Approve Extensions', icon: Calendar, href: '/extensions' },
    { label: 'Team Overview', icon: Users, href: '/team' },
    { label: 'Project Reports', icon: TrendingUp, href: '/reports' },
  ];

  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <stat.icon className={`w-12 h-12 text-${stat.color}-500`} />
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.label}
              className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <action.icon className="w-6 h-6 text-blue-600" />
              <span className="font-medium text-gray-700">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {[
            { user: 'John Doe', action: 'submitted', item: 'Market Analysis Report', time: '2 hours ago' },
            { user: 'Jane Smith', action: 'requested extension for', item: 'Technical Proposal', time: '4 hours ago' },
            { user: 'Mike Johnson', action: 'completed', item: 'Client Presentation', time: '1 day ago' },
          ].map((activity, i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold">{activity.user[0]}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">
                  <span className="font-semibold">{activity.user}</span> {activity.action}{' '}
                  <span className="font-semibold">{activity.item}</span>
                </p>
                <p className="text-xs text-gray-500">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ConsultantDashboard() {
  const stats = [
    { label: 'Active Projects', value: '3', icon: FolderKanban, color: 'blue' },
    { label: 'Hours This Month', value: '42', icon: Clock, color: 'green' },
    { label: 'Pending Deliverables', value: '2', icon: FileText, color: 'yellow' },
    { label: 'Completed Tasks', value: '15', icon: CheckCircle2, color: 'purple' },
  ];

  const quickActions = [
    { label: 'Upload Deliverable', icon: Upload, href: '/deliverables/upload' },
    { label: 'Log Time', icon: Clock, href: '/time-tracking' },
    { label: 'My Projects', icon: FolderKanban, href: '/projects' },
    { label: 'Request Extension', icon: Calendar, href: '/extensions/request' },
  ];

  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <stat.icon className={`w-12 h-12 text-${stat.color}-500`} />
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.label}
              className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <action.icon className="w-6 h-6 text-blue-600" />
              <span className="font-medium text-gray-700">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming Deadlines */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Upcoming Deadlines</h2>
        <div className="space-y-4">
          {[
            { title: 'Market Analysis Report', project: 'Client ABC', due: 'Tomorrow', urgent: true },
            { title: 'Technical Specification', project: 'Project XYZ', due: 'In 3 days', urgent: false },
            { title: 'Final Presentation', project: 'Consulting Engage', due: 'Next week', urgent: false },
          ].map((item, i) => (
            <div key={i} className={`p-4 rounded-lg border-2 ${item.urgent ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.project}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${item.urgent ? 'bg-red-200 text-red-800' : 'bg-gray-200 text-gray-700'}`}>
                  {item.due}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Work */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Work</h2>
        <div className="space-y-4">
          {[
            { title: 'Research Document', status: 'Approved', date: 'Dec 3, 2025' },
            { title: 'Client Presentation', status: 'Under Review', date: 'Dec 2, 2025' },
            { title: 'Analysis Report', status: 'Approved', date: 'Dec 1, 2025' },
          ].map((work, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">{work.title}</h3>
                <p className="text-sm text-gray-500">{work.date}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${work.status === 'Approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {work.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
