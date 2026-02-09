import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  checkEmail: (email: string) => api.get(`/auth/check-email?email=${encodeURIComponent(email)}`),
  getAllowedEmails: () => api.get('/auth/allowed-emails'),
};

export const projectsAPI = {
  getAll: () => api.get('/projects'),
  getById: (id: string) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
  update: (id: string, data: any) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
};

export const deliverablesAPI = {
  getAll: () => api.get('/deliverables'),
  getByProject: (projectId: string) => api.get(`/projects/${projectId}/deliverables`),
  create: (data: any) => api.post('/deliverables', data),
  update: (id: string, data: any) => api.put(`/deliverables/${id}`, data),
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
