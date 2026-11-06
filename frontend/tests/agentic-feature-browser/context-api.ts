export const api = { get: async () => ({ data: { project: { id: 'p1', name: 'Project One', overview: 'Read only overview', scope: 'SOW text' }, notes: [{ id: 'n1', title: 'Kickoff', content: 'Call notes', createdAt: '2026-01-01T00:00:00Z' }] } }), put: async () => ({ data: {} }), post: async () => ({ data: {} }), delete: async () => ({ data: {} }) };
export const setAuthToken = () => {};
export const authAPI = { getRole: async () => ({ data: { role: 'CONSULTANT' } }) };
export const projectsAPI = { getAll: async () => ({ data: { projects: (window as any).noProjects ? [] : [{ id: 'p1', name: 'Project One' }] } }) };
