import axios, { type AxiosRequestConfig } from 'axios';
import type { AlumniDataset } from './alumni-data';
import { clearNavigationSnapshots } from './navigation-cache';
import { cachedRequest, clearResourceCache, FRESHNESS } from './resource-cache';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Writes that do not change dashboard data, such as the sign-in profile sync.
const nonDataWrites = ['/auth/sync-user', '/notifications/bell-mirror'];

// A successful write can change data shown on another tab.
api.interceptors.response.use((response) => {
  if (['post', 'put', 'patch', 'delete'].includes(response.config.method?.toLowerCase() ?? '')
    && !nonDataWrites.includes(response.config.url ?? '')) {
    clearNavigationSnapshots();
    clearResourceCache();
  }
  return response;
});

export function clearProjectsCache(): void {
  clearResourceCache();
  // Remove entries persisted by the previous project-only cache.
  if (typeof window === 'undefined') return;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('otcr_projects_cache:')) localStorage.removeItem(key);
  }
}

// Add auth token to requests
export const setAuthToken = (token: string | null) => {
  
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// API endpoints
export const authAPI = {
  getCurrentUser: () => api.get('/auth/me'),
  health: () => api.get('/auth/health'),
  getRole: (config?: AxiosRequestConfig) => api.get('/auth/role', config),
  checkEmail: (email: string) => api.get(`/auth/check-email?email=${encodeURIComponent(email)}`),
  getAllowedEmails: () => cachedRequest('/auth/allowed-emails', () => api.get('/auth/allowed-emails')),
  addAllowedEmail: (data: { email: string; role?: 'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT' }) =>
    api.post('/auth/allowed-emails', data),
  syncUser: (data: { googleId: string; email: string; name?: string }) =>
    api.post('/auth/sync-user', data),
};

export const alumniAPI = {
  // An explicit refresh bypasses freshness but shares pending requests.
  getDataset: (refresh = false) => cachedRequest('/alumni', () => api.get<AlumniDataset>('/alumni'), refresh ? 0 : FRESHNESS.standard),
};

export const onboardingAPI = {
  createRequest: (data: {
    name: string;
    email: string;
    requestedRole: 'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT';
  }) => api.post('/onboarding/requests', data),
  listRequests: () =>
    api.get('/onboarding/requests', {
      params: { _ts: Date.now() },
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
      },
    }),
  approveRequest: (id: string, notes?: string, grantedRole?: string) =>
    api.patch(`/onboarding/requests/${id}/approve`, { notes, grantedRole }),
  rejectRequest: (id: string, notes?: string) =>
    api.patch(`/onboarding/requests/${id}/reject`, notes ? { notes } : {}),
};

export const feedbackAPI = {
  createSubmission: (data: { problem: string; description: string }) =>
    api.post('/feedback/submissions', data),
  listSubmissions: () =>
    api.get('/feedback/submissions', {
      params: { _ts: Date.now() },
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
      },
    }),
  createFormSubmission: (
    formType: 'DASHBOARD_FEEDBACK' | 'ANONYMOUS_FEEDBACK' | 'PRC',
    data: {
      problem?: string;
      description: string;
      urgency?: 'VERY_URGENT' | 'SOMEWHAT_URGENT' | 'NOT_VERY_URGENT';
      contactName?: string;
      contactEmail?: string;
    },
  ) => api.post(`/feedback/forms/${formType}/submissions`, data),
  listFormSubmissions: (formType: 'DASHBOARD_FEEDBACK' | 'ANONYMOUS_FEEDBACK' | 'PRC') =>
    api.get(`/feedback/forms/${formType}/submissions`, {
      params: { _ts: Date.now() },
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
      },
    }),
};

export const notificationsAPI = {
  mirrorBellNotification: (data: {
    assigneeEmail: string;
    title: string;
    message: string;
    type?: string;
    taskId?: string;
    taskTitle?: string;
  }) => api.post('/notifications/bell-mirror', data),
  getMy: (limit?: number) => api.get('/notifications/my', { params: limit ? { limit } : undefined }),
};

export type AttendanceLocationType = 'IN_PERSON' | 'ONLINE';
export type AttendanceAudienceScope = 'TEAM' | 'GLOBAL';
export type AttendanceVerificationMethod = 'GEOFENCE' | 'CODE';
export type AttendanceEventCategory = 'CLIENT_CALL' | 'TEAM_MEETING' | 'FIRMWIDE_EVENT' | 'SOCIAL';
export type AttendanceAvailabilitySlot = {
  start: string;
  end: string;
  availableCount: number;
  availableUsers?: Array<{
    id: string;
    name: string;
  }>;
  unavailableUsers?: Array<{
    id: string;
    name: string;
  }>;
};
export type AttendanceAvailabilityPoll = {
  enabled: boolean;
  windowStart: string;
  windowEnd: string;
  teamSize: number;
  respondentCount: number;
  currentUserSlots: string[];
  slots: AttendanceAvailabilitySlot[];
  bestSlots: AttendanceAvailabilitySlot[];
};

export type AttendanceEvent = {
  id: string;
  title: string;
  eventDate: string;
  locationType: AttendanceLocationType;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
  audienceScope: AttendanceAudienceScope;
  category: AttendanceEventCategory;
  projectId: string | null;
  projectName: string | null;
  createdById: string;
  createdByName: string;
  canManage: boolean;
  canControlOnlineCode: boolean;
  verificationCode: string | null;
  codeWindowOpensAt: string | null;
  codeWindowClosesAt: string | null;
  availabilityPoll: AttendanceAvailabilityPoll | null;
  attendanceCount: number;
  attendance: {
    present: boolean;
    verificationMethod: AttendanceVerificationMethod;
    codeVerified: boolean;
    checkedInAt: string;
  } | null;
};

export const attendanceAPI = {
  listEvents: () => cachedRequest('/attendance/events', () => api.get('/attendance/events'), FRESHNESS.live),
  createEvent: (data: {
    title: string;
    eventDate: string;
    locationType: AttendanceLocationType;
    category?: AttendanceEventCategory;
    locationLabel?: string;
    latitude?: number;
    longitude?: number;
    geofenceRadiusMeters?: number;
    audienceScope?: AttendanceAudienceScope;
    projectId?: string;
    availabilityPoll?: {
      enabled?: boolean;
      windowStart?: string;
      windowEnd?: string;
    };
  }) => api.post('/attendance/events', data),
  saveAvailability: (eventId: string, data: { slotStarts: string[] }) =>
    api.post(`/attendance/events/${eventId}/availability`, data),
  openCodeWindow: (eventId: string) => api.post(`/attendance/events/${eventId}/code-window`),
  deleteEvent: (eventId: string) => api.delete(`/attendance/events/${eventId}`),
  checkIn: (eventId: string, data: {
    method: AttendanceVerificationMethod;
    latitude?: number;
    longitude?: number;
    code?: string;
  }) => api.post(`/attendance/events/${eventId}/check-in`, data),
  listAttendances: (eventId: string) => api.get(`/attendance/events/${eventId}/attendances`),
  getMemberHistory: (memberId: string, projectId: string) =>
    api.get(`/attendance/members/${memberId}/history`, { params: { projectId } }),
};

export type When2MeetPollSummary = {
  id: string;
  title: string;
  projectId: string;
  createdAt: string;
};

export type When2MeetGridSpec = {
  numCols: number;
  numRows: number;
  totalSlots: number;
  slotStartMinute: number;
  slotEndMinute: number;
  gridFirstDate: string | null;
  gridLastDate: string | null;
  columnLabels: string[];
  rowStartLabels: string[];
};

export type When2MeetPollDetail = {
  poll: When2MeetPollSummary;
  grid: When2MeetGridSpec;
  teamSize: number;
  members: Array<{ id: string; email: string; displayName: string }>;
  slots: Array<{ slotIndex: number; names: string[]; userIds?: string[] }>;
  mySlots: number[];
};

export const when2meetAPI = {
  createPoll: (body: {
    projectId: string;
    title: string;
    gridFirstDate: string;
    gridLastDate: string;
    slotStart: string;
    slotEnd: string;
  }) => api.post('/when2meet/polls', body),
  listPolls: (projectId: string) =>
    cachedRequest(`/when2meet/polls?projectId=${encodeURIComponent(projectId)}`,
      () => api.get('/when2meet/polls', { params: { projectId } }), FRESHNESS.live),
  getPoll: (id: string) => cachedRequest(`/when2meet/polls/${id}`, () => api.get(`/when2meet/polls/${id}`), FRESHNESS.live),
  deletePoll: (id: string) => api.delete(`/when2meet/polls/${id}`),
  saveMyAvailability: (id: string, slots: number[]) =>
    api.put(`/when2meet/polls/${id}/my-availability`, { slots }),
};

export type ProjectsQuery = {
  status?: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  search?: string;
  pmId?: string;
  userId?: string;
  includeMembers?: boolean;
  includeDeliverables?: boolean;
  page?: number;
  limit?: number;
};

export type ProjectListItem = {
  id: string;
  name: string;
  pm?: {
    email?: string | null;
  } | null;
  members?: Array<{
    user: {
      email?: string | null;
    };
  }>;
  googleCalendarId?: string | null;
  googleCalendarEmbedUrl?: string | null;
};

export const projectsAPI = {
  getAll: (params?: ProjectsQuery) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    if (params?.pmId) q.set('pmId', params.pmId);
    if (params?.userId) q.set('userId', params.userId);
    if (params?.includeMembers) q.set('includeMembers', 'true');
    if (params?.includeDeliverables) q.set('includeDeliverables', 'true');
    if (params?.page != null) q.set('page', String(params.page));
    if (params?.limit != null) q.set('limit', String(params.limit));
    const query = q.toString();
    const path = '/projects' + (query ? `?${query}` : '');
    return cachedRequest(path, () => api.get(path));
  },
  getById: (id: string, options?: { includeMembers?: boolean; includeDeliverables?: boolean }) => {
    const q = new URLSearchParams();
    if (options?.includeMembers) q.set('includeMembers', 'true');
    if (options?.includeDeliverables) q.set('includeDeliverables', 'true');
    const query = q.toString();
    const path = `/projects/${id}` + (query ? `?${query}` : '');
    return cachedRequest(path, () => api.get(path));
  },
  create: (data: {
    name: string;
    description?: string;
    clientName?: string;
    startDate: string;
    endDate?: string;
    googleCalendarId?: string | null;
    googleCalendarEmbedUrl?: string | null;
    pmId?: string;
    memberIds?: string[];
    memberEmails?: string[];
  }) => api.post('/projects', data).then((response) => {
    clearProjectsCache();
    return response;
  }),
  update: (id: string, data: {
    name?: string;
    description?: string;
    clientName?: string;
    startDate?: string;
    endDate?: string;
    googleCalendarId?: string | null;
    googleCalendarEmbedUrl?: string | null;
    status?: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  }) => api.patch(`/projects/${id}`, data).then((response) => {
    clearProjectsCache();
    return response;
  }),
  delete: (id: string) => api.delete(`/projects/${id}`).then((response) => {
    clearProjectsCache();
    return response;
  }),
  addMember: (projectId: string, body: { userId?: string; email?: string }) =>
    api.post(`/projects/${projectId}/members`, body).then((response) => {
      clearProjectsCache();
      return response;
    }),
  removeMember: (projectId: string, userId: string) =>
    api.delete(`/projects/${projectId}/members/${userId}`).then((response) => {
      clearProjectsCache();
      return response;
    }),
  getSprintConfig: (projectId: string) =>
    cachedRequest(`/projects/${projectId}/sprint-config`, () => api.get(`/projects/${projectId}/sprint-config`)),
  updateSprintConfig: (
    projectId: string,
    data: {
      sprintStartDay?: string;
      initialSlideDueDay?: string;
      finalSlideDueDay?: string;
      defaultDueTime?: string;
      sprintTimezone?: string;
      autoGenerateSprints?: boolean;
    },
  ) => api.patch(`/projects/${projectId}/sprint-config`, data),
  getSprints: (projectId: string) => cachedRequest(`/projects/${projectId}/sprints`, () => api.get(`/projects/${projectId}/sprints`)),
  updateSprintNotes: (projectId: string, sprintId: string, data: { generalNotes?: string }) =>
    api.patch(`/projects/${projectId}/sprints/${sprintId}/notes`, data),
  getSprintById: (projectId: string, sprintId: string) =>
    api.get(`/projects/${projectId}/sprints/${sprintId}`),
  updateSprint: (projectId: string, sprintId: string, data: { weekStartDate?: string }) =>
    api.patch(`/projects/${projectId}/sprints/${sprintId}`, data),
  generateNextSprint: (projectId: string, data?: { startDate?: string }) =>
    api.post(`/projects/${projectId}/sprints/generate-next`, data ?? {}),
  updateSprintStatus: (projectId: string, sprintId: string, status: 'DRAFT' | 'RELEASED') =>
    api.patch(`/projects/${projectId}/sprints/${sprintId}/status`, { status }),
  deleteSprint: (projectId: string, sprintId: string) =>
    api.delete(`/projects/${projectId}/sprints/${sprintId}`),
};

export type ReminderOffsetPreset = { minutes: number; label: string };
export type ReminderConfig = { enabled: boolean; offsetsMinutes: number[]; timezone: string };
export type ReminderRecipient = { userId: string; email: string; name: string; slackConnected: boolean };
export type ReminderRecipientGroup = {
  deliverableId: string;
  title: string;
  deadline: string;
  unassigned: boolean;
  recipients: ReminderRecipient[];
};

export type DeliverableReminderSettings = ReminderConfig & {
  override: { enabled: boolean | null; offsetMinutes: number[]; explicitRecipientUserIds: string[] } | null;
  eligibleRecipients: ReminderRecipient[];
};
export type ReminderDeliveryStatus = {
  id: string; status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'; fireAt: string; attempts: number; lastError: string | null;
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  deliverable: { id: string; title: string; deadline: string };
};

export const remindersAPI = {
  getPresets: (projectId: string) => api.get(`/projects/${projectId}/reminders/presets`),
  getConfig: (projectId: string) => api.get(`/projects/${projectId}/reminders/config`),
  updateConfig: (projectId: string, data: { enabled: boolean; offsetsMinutes: number[] }) =>
    api.patch(`/projects/${projectId}/reminders/config`, data),
  getRecipients: (projectId: string) => api.get(`/projects/${projectId}/reminders/recipients`),
  getStatus: (projectId: string, status?: string) =>
    api.get<ReminderDeliveryStatus[]>(`/projects/${projectId}/reminders/status`, { params: status ? { status } : {} }),
  getDeliverableConfig: (deliverableId: string) =>
    api.get<DeliverableReminderSettings>(`/projects/deliverables/${deliverableId}/reminders/config`),
  updateDeliverableConfig: (
    deliverableId: string,
    data: {
      enabled?: boolean | null;
      offsetMinutes?: number[];
      explicitRecipientUserIds?: string[];
    },
  ) => api.patch<DeliverableReminderSettings>(`/projects/deliverables/${deliverableId}/reminders/config`, data),
};

export type TaskAssigneeType = 'PERSON' | 'ALL' | 'ALL_PMS' | 'ALL_TEAM';

export const tasksAPI = {
  getAll: (params?: { workstreamId?: string; includeCompleted?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.workstreamId) q.set('workstreamId', params.workstreamId);
    if (params?.includeCompleted === false) q.set('includeCompleted', 'false');
    const query = q.toString();
    return api.get('/tasks' + (query ? `?${query}` : ''));
  },
  getById: (id: string) => api.get(`/tasks/${id}`),
  create: (data: {
    taskName: string;
    description?: string;
    dueDate: string;
    dueTime?: string;
    projectName: string;
    workstream: string;
    workstreamId?: string;
    assigneeType: TaskAssigneeType;
    assigneeEmail?: string;
    projectId?: string;
  }) => api.post('/tasks', data),
  update: (id: string, data: {
    taskName?: string;
    description?: string;
    dueDate?: string;
    dueTime?: string;
    status?: string;
    completed?: boolean;
    assigneeType?: TaskAssigneeType;
    assigneeEmail?: string;
    projectId?: string;
  }) => api.patch(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
};

export const deliverablesAPI = {
  getAll: (params?: Record<string, string | number | boolean>) => {
    const query = new URLSearchParams(Object.entries(params ?? {}).map(([key, value]) => [key, String(value)])).toString();
    return cachedRequest('/deliverables' + (query ? `?${query}` : ''), () => api.get('/deliverables', { params }));
  },
  getByProject: (projectId: string) => api.get('/deliverables', { 
    params: { projectId } 
  }),
  create: (data: any) => api.post('/deliverables', data),
  update: (id: string, data: any) => api.patch(`/deliverables/${id}`, data),
  updateDeadline: (id: string, deadline: string) => api.patch(`/deliverables/${id}/deadline`, { deadline }),
  updateAssignment: (id: string, assigned: boolean, assigneeId?: string) =>
    api.patch(`/deliverables/${id}/assignment`, { assigned, assigneeId }),
  setAssignments: (id: string, assigneeIds: string[]) =>
    api.patch(`/deliverables/${id}/assignments`, { assigneeIds }),
  updateCompletion: (id: string, completed: boolean) =>
    api.patch(`/deliverables/${id}/completion`, { completed }),
  createSubtask: (
    id: string,
    data: { title: string; notes?: string; dueDate?: string; assigneeId?: string },
  ) => api.post(`/deliverables/${id}/subtasks`, data),
  updateSubtask: (
    id: string,
    data: {
      title?: string;
      notes?: string;
      dueDate?: string | null;
      completed?: boolean;
      assigneeId?: string | null;
    },
  ) => api.patch(`/deliverables/subtasks/${id}`, data),
  deleteSubtask: (id: string) => api.delete(`/deliverables/subtasks/${id}`),
  submitLink: (id: string, link: string) =>
    api.post(`/deliverables/${id}/submissions`, { link }),
  delete: (id: string) => api.delete(`/deliverables/${id}`),
};

export const submissionsAPI = {
  create: (deliverableId: string, data: any) => api.post(`/deliverables/${deliverableId}/submissions`, data),
  approve: (id: string, feedback?: string) => api.post(`/submissions/${id}/approve`, { feedback }),
  reject: (id: string, feedback: string) => api.post(`/submissions/${id}/reject`, { feedback }),
};

export const extensionsAPI = {
  request: (deliverableId: string, data: any) => api.post(`/deliverables/${deliverableId}/extensions`, data),
  approve: (id: string, notes?: string) => api.post(`/extensions/${id}/approve`, { notes }),
  deny: (id: string, notes: string) => api.post(`/extensions/${id}/deny`, { notes }),
};

export const timeTrackingAPI = {
  log: (data: any) => api.post('/time-entries', data),
  getByUser: (userId: string) => api.get(`/users/${userId}/time-entries`),
  getByProject: (projectId: string) => api.get(`/projects/${projectId}/time-entries`),
};

export type SlackOAuthPurpose = 'INSTALL' | 'CONNECT';

export const slackAPI = {
  getInstallUrl: (params: {
    purpose: SlackOAuthPurpose;
    workspaceId?: string;
    redirectUri?: string;
  }) => api.get('/integrations/slack/install-url', { params }),
  connectByEmail: (teamId?: string) =>
    api.post('/integrations/slack/connect-by-email', teamId ? { teamId } : {}),
  getConnections: () => api.get('/integrations/slack/connections'),
};

export const slideSubmissionsAPI = {
  submit: (data: {
    deliverableId: string;
    presentationLink: string;
    fileName?: string;
    mimeType?: string;
  }) => api.post('/slide-submissions', data),
  getMine: () => cachedRequest('/slide-submissions/my', () => api.get('/slide-submissions/my')),
  getAll: () => cachedRequest('/slide-submissions/all', () => api.get('/slide-submissions/all')),
  markCommented: (id: string) => api.post(`/slide-submissions/${id}/mark-commented`),
  approve: (id: string) => api.post(`/slide-submissions/${id}/approve`),
  requestRevision: (id: string, feedback?: string) =>
    api.post(`/slide-submissions/${id}/request-revision`, feedback ? { feedback } : {}),
};

export const peopleAPI = {
  list: () => api.get('/people'),
  changeRole: (id: string, role: string) => api.patch(`/people/${id}/role`, { role }),
};
