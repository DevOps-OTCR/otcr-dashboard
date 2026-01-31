import type {
  Announcement,
  ActionItem,
  WorkstreamDeadline,
  ExtensionRequest,
  Document,
  PreviousWeekSummary,
  DashboardStats,
} from '@/types';

// Helper function to get date relative to now
const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

export const mockAnnouncements: Announcement[] = [
  {
    id: '1',
    title: 'Team Meeting - Friday 2PM',
    message: 'All team members are required to attend the weekly sync meeting. We will discuss Q4 deliverables and client feedback.',
    author: 'Lakshay Sharma',
    priority: 'urgent',
    createdAt: daysFromNow(-1),
    workstream: 'General',
  },
  {
    id: '2',
    title: 'Market Analysis Due Next Week',
    message: 'Reminder: The market analysis section for the healthcare project is due Monday. Please ensure all data is validated.',
    author: 'Lakshay Sharma',
    priority: 'urgent',
    createdAt: daysFromNow(-2),
    workstream: 'Market Research',
  },
  {
    id: '3',
    title: 'New Resource Library Available',
    message: 'Check out the updated resource library with industry reports and templates in the Documents section.',
    author: 'Admin',
    priority: 'normal',
    createdAt: daysFromNow(-3),
  },
];

export const mockActionItems: ActionItem[] = [
  {
    id: '1',
    taskName: 'Complete market analysis section',
    dueDate: daysFromNow(2),
    projectName: 'Healthcare Startup Consulting',
    workstream: 'Market Research',
    status: 'in_progress',
    assignedTo: 'current_user',
    description: 'Analyze TAM, SAM, SOM for the healthcare startup',
    completed: false,
  },
  {
    id: '2',
    taskName: 'Review competitor financial data',
    dueDate: daysFromNow(1),
    projectName: 'Financial Dashboard Project',
    workstream: 'Financial Analysis',
    status: 'pending',
    assignedTo: 'current_user',
    description: 'Compile and analyze competitor revenue models',
    completed: false,
  },
  {
    id: '3',
    taskName: 'Update client presentation slides',
    dueDate: daysFromNow(-1),
    projectName: 'Product Redesign',
    workstream: 'Client Presentation',
    status: 'overdue',
    assignedTo: 'current_user',
    description: 'Incorporate feedback from last meeting',
    completed: false,
  },
  {
    id: '4',
    taskName: 'Conduct user interviews',
    dueDate: daysFromNow(5),
    projectName: 'Product Redesign',
    workstream: 'User Research',
    status: 'pending',
    assignedTo: 'current_user',
    completed: false,
  },
  {
    id: '5',
    taskName: 'Prepare Q4 budget analysis',
    dueDate: daysFromNow(7),
    projectName: 'Financial Dashboard Project',
    workstream: 'Financial Analysis',
    status: 'pending',
    assignedTo: 'current_user',
    completed: false,
  },
];

export const mockWorkstreamDeadlines: WorkstreamDeadline[] = [
  {
    id: '1',
    workstreamName: 'Market Research',
    deadline: daysFromNow(3),
    daysRemaining: 3,
    progress: 65,
    description: 'Complete market sizing and competitor analysis',
    status: 'at_risk',
  },
  {
    id: '2',
    workstreamName: 'Financial Analysis',
    deadline: daysFromNow(7),
    daysRemaining: 7,
    progress: 80,
    description: 'Finalize revenue projections and budget breakdown',
    status: 'on_track',
  },
  {
    id: '3',
    workstreamName: 'Client Presentation',
    deadline: daysFromNow(1),
    daysRemaining: 1,
    progress: 45,
    description: 'Prepare and review final presentation deck',
    status: 'overdue',
  },
  {
    id: '4',
    workstreamName: 'User Research',
    deadline: daysFromNow(10),
    daysRemaining: 10,
    progress: 30,
    description: 'Conduct interviews and compile findings',
    status: 'on_track',
  },
];

export const mockExtensionRequests: ExtensionRequest[] = [
  {
    id: '1',
    workstream: 'Market Research',
    originalDeadline: daysFromNow(3),
    requestedDeadline: daysFromNow(6),
    reason: 'Waiting for additional data from client to complete the competitive analysis section.',
    status: 'pending',
    requestedBy: 'Chinmay Rawat',
    requestedAt: daysFromNow(-1),
  },
  {
    id: '2',
    workstream: 'Financial Analysis',
    originalDeadline: daysFromNow(-5),
    requestedDeadline: daysFromNow(-2),
    reason: 'Team member was sick, needed extra time to complete revenue model.',
    status: 'approved',
    requestedBy: 'Chinmay Rawat',
    requestedAt: daysFromNow(-7),
    reviewedBy: 'Lakshay Sharma',
    reviewedAt: daysFromNow(-6),
    reviewNotes: 'Approved. Please prioritize completion.',
  },
];

export const mockDocuments: Document[] = [
  {
    id: '1',
    name: 'Market Analysis Template',
    type: 'google_docs',
    url: '#',
    workstream: 'Market Research',
    uploadedBy: 'Lakshay Sharma',
    uploadedAt: daysFromNow(-10),
    lastModified: daysFromNow(-2),
  },
  {
    id: '2',
    name: 'Financial Model Q4 2024',
    type: 'google_sheets',
    url: '#',
    workstream: 'Financial Analysis',
    uploadedBy: 'Chinmay Rawat',
    uploadedAt: daysFromNow(-8),
    lastModified: daysFromNow(-1),
  },
  {
    id: '3',
    name: 'Client Presentation Deck',
    type: 'google_slides',
    url: '#',
    workstream: 'Client Presentation',
    uploadedBy: 'Team',
    uploadedAt: daysFromNow(-5),
    lastModified: daysFromNow(0),
  },
  {
    id: '4',
    name: 'User Research Findings Report',
    type: 'pdf',
    url: '#',
    workstream: 'User Research',
    uploadedBy: 'Chinmay Rawat',
    uploadedAt: daysFromNow(-3),
    lastModified: daysFromNow(-3),
  },
  {
    id: '5',
    name: 'Competitor Analysis Data',
    type: 'google_sheets',
    url: '#',
    workstream: 'Market Research',
    uploadedBy: 'Team',
    uploadedAt: daysFromNow(-12),
    lastModified: daysFromNow(-4),
  },
  {
    id: '6',
    name: 'Industry Benchmarking Report',
    type: 'pdf',
    url: '#',
    workstream: 'Market Research',
    uploadedBy: 'Lakshay Sharma',
    uploadedAt: daysFromNow(-15),
    lastModified: daysFromNow(-15),
  },
];

export const mockPreviousWeekSummary: PreviousWeekSummary = {
  weekStart: daysFromNow(-7),
  weekEnd: daysFromNow(-1),
  completedTasks: [
    {
      id: 'past1',
      taskName: 'Completed initial market research',
      dueDate: daysFromNow(-5),
      projectName: 'Healthcare Startup Consulting',
      workstream: 'Market Research',
      status: 'completed',
      assignedTo: 'current_user',
      completed: true,
    },
    {
      id: 'past2',
      taskName: 'Prepared financial model v1',
      dueDate: daysFromNow(-3),
      projectName: 'Financial Dashboard Project',
      workstream: 'Financial Analysis',
      status: 'completed',
      assignedTo: 'current_user',
      completed: true,
    },
  ],
  hoursLogged: 18,
  workstreams: [
    {
      name: 'Market Research',
      tasksCompleted: 3,
      keyAccomplishments: [
        'Completed TAM/SAM/SOM analysis',
        'Identified 5 key competitors',
        'Created competitor comparison matrix',
      ],
    },
    {
      name: 'Financial Analysis',
      tasksCompleted: 2,
      keyAccomplishments: [
        'Built revenue projection model',
        'Analyzed Q4 budget allocation',
      ],
    },
  ],
};

export const mockDashboardStats: DashboardStats = {
  pendingActionItems: mockActionItems.filter(item => !item.completed).length,
  upcomingDeadlines: mockWorkstreamDeadlines.filter(d => d.daysRemaining <= 7).length,
  activeWorkstreams: mockWorkstreamDeadlines.length,
  hoursThisWeek: 12,
};
