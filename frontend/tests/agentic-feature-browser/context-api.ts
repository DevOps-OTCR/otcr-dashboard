const storageKey = 'agentic-context-mock';
const initial: Record<string, any> = {
  p1: { project: { id: 'p1', name: 'Project One', overview: 'Read only overview', scope: 'SOW text' }, notes: [{ id: 'n1', title: 'Kickoff', content: 'Call notes', createdAt: '2026-01-01T00:00:00Z' }] },
  p2: { project: { id: 'p2', name: 'Project Two', overview: 'Other project overview', scope: 'Other project scope' }, notes: [] },
};
const readAll = () => JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(initial));
const projectId = (url: string) => url.match(/projects\/(p[12])/)?.[1] ?? 'p1';
const editable = (id: string) => ['ADMIN', 'LC'].includes((window as any).testRole) || ((window as any).testRole === 'PM' && id === 'p1');
// Tests release pending writes explicitly to exercise switching during requests.
const writes = { pending: [] as Array<{ method: string; projectId: string; finish: (fail: boolean) => void }> };
(window as any).contextWrites = writes;
const write = async <T,>(method: string, id: string, operation: () => T): Promise<T> => {
  if ((window as any).holdWrites) {
    await new Promise<void>((resolve, reject) => writes.pending.push({ method, projectId: id,
      finish: fail => fail ? reject(new Error('Synthetic write failure')) : resolve() }));
  }
  return operation();
};
export const api = {
  get: async (url: string) => {
    const id = projectId(url);
    if ((window as any).failProjectTwo && id === 'p2') throw new Error('Synthetic project load failure');
    if ((window as any).delayProjectTwo && id === 'p2') await new Promise(resolve => setTimeout(resolve, 100));
    const data = readAll()[id];
    return { data: { ...data, canEdit: editable(id) } };
  },
  put: async (url: string, body: { overview: string; scope: string }) => write('PUT', projectId(url), () => { const id = projectId(url); const all = readAll(); all[id].project.overview = body.overview; all[id].project.scope = body.scope; localStorage.setItem(storageKey, JSON.stringify(all)); return { data: all[id].project }; }),
  post: async (url: string, body: { title: string; content: string }) => write('POST', projectId(url), () => { const id = projectId(url); const all = readAll(); const note = { id: `n${Date.now()}`, ...body, createdAt: new Date().toISOString() }; all[id].notes.unshift(note); localStorage.setItem(storageKey, JSON.stringify(all)); return { data: note }; }),
  delete: async (url: string) => write('DELETE', projectId(url), () => { const id = projectId(url); const all = readAll(); all[id].notes.shift(); localStorage.setItem(storageKey, JSON.stringify(all)); return { data: {} }; }),
};
export const setAuthToken = () => {};
export const authAPI = { getRole: async () => ({ data: { role: 'CONSULTANT' } }) };
export const projectsAPI = { getAll: async () => ({ data: { projects: (window as any).noProjects ? [] : [{ id: 'p1', name: 'Project One', pmId: 'reader' }, { id: 'p2', name: 'Project Two', pmId: 'other' }] } }) };
