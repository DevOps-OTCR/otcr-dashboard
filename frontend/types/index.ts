// Core Types for OTCR Dashboard

export type UserRole = 'PM' | 'CONSULTANT' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl?: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  author: string;
  priority: 'normal' | 'urgent';
  createdAt: Date;
  workstream?: string;
}

export interface ActionItem {
  id: string;
  taskName: string;
  dueDate: Date;
  projectName: string;
  workstream: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  assignedTo: string;
  description?: string;
  completed: boolean;
}

export interface WorkstreamDeadline {
  id: string;
  workstreamName: string;
  deadline: Date;
  daysRemaining: number;
  progress?: number;
  description?: string;
  status: 'on_track' | 'at_risk' | 'overdue';
}

export interface ExtensionRequest {
  id: string;
  workstream: string;
  originalDeadline: Date;
  requestedDeadline: Date;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  requestedBy: string;
  requestedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

export type DocumentType = 'google_docs' | 'google_sheets' | 'google_slides' | 'pdf' | 'other';

export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  url: string;
  workstream: string;
  uploadedBy: string;
  uploadedAt: Date;
  lastModified: Date;
}

export interface PreviousWeekSummary {
  weekStart: Date;
  weekEnd: Date;
  completedTasks: ActionItem[];
  hoursLogged: number;
  workstreams: {
    name: string;
    tasksCompleted: number;
    keyAccomplishments: string[];
  }[];
}

export interface DashboardStats {
  pendingActionItems: number;
  upcomingDeadlines: number;
  activeWorkstreams: number;
  hoursThisWeek: number;
}
