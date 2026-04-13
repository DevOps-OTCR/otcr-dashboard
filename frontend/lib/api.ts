import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const PROJECTS_CACHE_PREFIX = 'otcr_projects_cache:';
const PROJECTS_CACHE_TTL_MS = 2 * 60 * 1000;
const projectsMemoryCache = new Map<string, { cachedAt: number; data: unknown }>();

function getProjectsCacheKey(query: string): string {
  return `${PROJECTS_CACHE_PREFIX}${query || '__all__'}`;
}

function readProjectsCache(key: string): unknown | null {
  const memoryEntry = projectsMemoryCache.get(key);
  if (memoryEntry && Date.now() - memoryEntry.cachedAt <= PROJECTS_CACHE_TTL_MS) {
    return memoryEntry.data;
  }
  if (memoryEntry) projectsMemoryCache.delete(key);

  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cachedAt?: number; data?: unknown };
    if (typeof parsed?.cachedAt !== 'number') {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.cachedAt > PROJECTS_CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    projectsMemoryCache.set(key, { cachedAt: parsed.cachedAt, data: parsed.data });
    return parsed.data ?? null;
  } catch {
    if (typeof window !== 'undefined') localStorage.removeItem(key);
    return null;
  }
}

function writeProjectsCache(key: string, data: unknown): void {
  const entry = { cachedAt: Date.now(), data };
  projectsMemoryCache.set(key, entry);
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore storage failures.
  }
}

export function clearProjectsCache(): void {
  projectsMemoryCache.clear();
  if (typeof window === 'undefined') return;
  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(PROJECTS_CACHE_PREFIX)) keysToDelete.push(key);
  }
  keysToDelete.forEach((key) => localStorage.removeItem(key));
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
  getRole: () => api.get('/auth/roles'),
  checkEmail: (email: string) => api.get(`/auth/check-email?email=${encodeURIComponent(email)}`),
  getAllowedEmails: () => api.get('/auth/allowed-emails'),
  addAllowedEmail: (data: { email: string; role?: 'ADMIN' | 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'CONSULTANT' }) =>
    api.post('/auth/allowed-emails', data),
  syncUser: (data: { googleId: string; email: string; name?: string }) =>
    api.post('/auth/sync-user', data),
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
  approveRequest: (id: string, notes?: string) =>
    api.patch(`/onboarding/requests/${id}/approve`, notes ? { notes } : {}),
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
};
export type AttendanceAvailabilityPoll = {
  enabled: boolean;
  windowStart: string;
  windowEnd: string;
  slotMinutes: number;
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
  listEvents: () => api.get('/attendance/events'),
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
      slotMinutes?: number;
    };
  }) => api.post('/attendance/events', data),
  saveAvailability: (eventId: string, data: { slotStarts: string[] }) =>
    api.post(`/attendance/events/${eventId}/availability`, data),
  openCodeWindow: (eventId: string) => api.post(`/attendance/events/${eventId}/code-window`),
  deleteEvent: (eventId: string) => api.delete(`/attendance/events/${eventId}`),
  checkIn: (eventId: string, data: {
    method: AttendanceVerificationMethod;
    geofenceVerified?: boolean;
    code?: string;
  }) => api.post(`/attendance/events/${eventId}/check-in`, data),
  listAttendances: (eventId: string) => api.get(`/attendance/events/${eventId}/attendances`),
  getMemberHistory: (memberId: string, projectId: string) =>
    api.get(`/attendance/members/${memberId}/history`, { params: { projectId } }),
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
    const cacheKey = getProjectsCacheKey(query);
    const cachedData = readProjectsCache(cacheKey);
    if (cachedData !== null) {
      return Promise.resolve({
        data: cachedData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any);
    }
    return api.get('/projects' + (query ? `?${query}` : '')).then((response) => {
      writeProjectsCache(cacheKey, response.data);
      return response;
    });
  },
  getById: (id: string, options?: { includeMembers?: boolean; includeDeliverables?: boolean }) => {
    const q = new URLSearchParams();
    if (options?.includeMembers) q.set('includeMembers', 'true');
    if (options?.includeDeliverables) q.set('includeDeliverables', 'true');
    const query = q.toString();
    return api.get(`/projects/${id}` + (query ? `?${query}` : ''));
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
  getSprintConfig: (projectId: string) => api.get(`/projects/${projectId}/sprint-config`),
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
  getSprints: (projectId: string) => api.get(`/projects/${projectId}/sprints`),
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
  getAll: (params?: any) => api.get('/deliverables', { params }),
  getByProject: (projectId: string) => api.get('/deliverables', { 
    params: { projectId } 
  }),
  create: (data: any) => api.post('/deliverables', data),
  update: (id: string, data: any) => api.patch(`/deliverables/${id}`, data),
  updateDeadline: (id: string, deadline: string) => api.patch(`/deliverables/${id}/deadline`, { deadline }),
  updateAssignment: (id: string, assigned: boolean, assigneeId?: string) =>
    api.patch(`/deliverables/${id}/assignment`, { assigned, assigneeId }),
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
  getMine: () => api.get('/slide-submissions/my'),
  getAll: () => api.get('/slide-submissions/all'),
  markCommented: (id: string) => api.post(`/slide-submissions/${id}/mark-commented`),
  approve: (id: string) => api.post(`/slide-submissions/${id}/approve`),
  requestRevision: (id: string, feedback?: string) =>
    api.post(`/slide-submissions/${id}/request-revision`, feedback ? { feedback } : {}),
};
