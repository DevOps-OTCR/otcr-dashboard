const { responseFor } = require('../navigation-browser/fixtures.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
exports.createApi = () => {
  const members = [{ id: 'u-1', email: 'pm@example.test', firstName: 'Test', lastName: 'PM' }, { id: 'u-2', email: 'consultant@example.test', firstName: 'Alex', lastName: 'Consultant' }];
  const projects = ['team-1', 'team-2'].map((id, i) => ({ id, name: ['Team One', 'Team Two'][i], createdAt: '2026-10-01', googleCalendarId: `${id}@example.test`, pm: members[0], members: members.map(user => ({ user })) }));
  const schedules = Object.fromEntries(projects.map(p => [p.id, { sprintStartDay: 'WEDNESDAY', initialSlideDueDay: 'THURSDAY', finalSlideDueDay: 'SATURDAY', defaultDueTime: '17:30', sprintTimezone: 'America/Chicago', autoGenerateSprints: false }]));
  const weeks = Object.fromEntries(projects.map(p => [p.id, [1, 2].map(n => ({ id: `${p.id}-week-${n}`, label: `Week ${n}`, status: 'RELEASED', weekStartDate: '2026-10-12', weekEndDate: '2026-10-18', configSnapshot: { generalNotes: `${p.name} notes ${n}`, defaultDueTime: '23:59' },
    deliverables: ['research', 'analysis'].map(kind => ({ id: `${p.id}-${n}-${kind}`, sprintId: `${p.id}-week-${n}`, title: `${kind === 'research' ? 'Research' : 'Analysis'} Week ${n}`, status: 'PENDING', deadline: '2026-10-18T23:00:00.000Z', dueDateSource: 'AUTO', assignees: [],
      subtasks: [{ id: `${p.id}-${n}-${kind}-task`, title: 'Review sources', dueDate: null, completed: false, assigneeId: null, assignee: null }],
    })),
  }))]));
  const writes = [], reads = [];
  let hold, fail;
  const allWeeks = () => Object.values(weeks).flat();
  const tasks = () => allWeeks().flatMap(w => w.deliverables);
  const api = {
    projects, schedules, weeks, writes, reads,
    holdNext: predicate => {
      let release, arrived;
      const waiting = new Promise(resolve => { arrived = resolve; });
      const promise = new Promise(resolve => { release = resolve; });
      hold = { predicate, promise, arrived }; return { release, waiting };
    },
    failNext: predicate => { fail = predicate; },
    async request(path, method = 'GET', body) {
      const record = { path, method, body }; (method === 'GET' ? reads : writes).push(record);
      // Snapshot GET data at request time, so tests can exercise stale read responses.
      let data;
      if (method === 'GET') {
        const match = path.match(/^\/projects\/([^/]+)(?:\/(sprints|sprint-config))?$/);
        data = path === '/projects' ? { projects } : match ? (match[2] === 'sprints' ? weeks[match[1]] : match[2] === 'sprint-config' ? schedules[match[1]] : projects.find(p => p.id === match[1])) : responseFor(path, 'PM');
        data = clone(data);
      }
      if (hold?.predicate(record)) { const current = hold; hold = null; current.arrived(); await current.promise; }
      if (fail?.(record)) { fail = null; return { status: 503, data: { message: 'Synthetic offline failure' } }; }
      if (method !== 'GET') {
        const sprint = path.match(/^\/projects\/([^/]+)\/sprints\/([^/]+)(\/notes)?$/);
        const schedule = path.match(/^\/projects\/([^/]+)\/sprint-config$/);
        const project = path.match(/^\/projects\/([^/]+)$/);
        const subtask = path.match(/^\/deliverables\/subtasks\/([^/]+)$/);
        const deliverable = path.match(/^\/deliverables\/([^/]+)\/(deadline|assignments|completion|subtasks)$/);
        if (sprint) {
          const w = weeks[sprint[1]].find(w => w.id === sprint[2]);
          if (sprint[3]) Object.assign(w.configSnapshot, body);
          else {
            w.weekStartDate = body.weekStartDate;
            w.weekEndDate = new Date(new Date(`${body.weekStartDate}T00:00:00Z`).getTime() + 6 * 86400000).toISOString().slice(0, 10);
            w.deliverables.filter(d => d.dueDateSource === 'AUTO').forEach(d => { d.deadline = `${w.weekEndDate}T23:00:00.000Z`; });
          }
          data = w;
        } else if (schedule) { data = Object.assign(schedules[schedule[1]], body); }
        else if (project) { data = Object.assign(projects.find(p => p.id === project[1]), body); }
        else if (subtask) {
          const task = tasks().flatMap(d => d.subtasks).find(s => s.id === subtask[1]);
          Object.assign(task, body); if ('assigneeId' in body) task.assignee = members.find(m => m.id === body.assigneeId) ?? null;
          data = task;
        } else if (deliverable) {
          const d = tasks().find(d => d.id === deliverable[1]);
          switch (deliverable[2]) {
            case 'deadline': Object.assign(d, body, { dueDateSource: 'MANUAL' }); data = d; break;
            case 'assignments': d.assignees = members.filter(m => body.assigneeIds.includes(m.id)); data = d.assignees; break;
            case 'completion': Object.assign(d, body); data = d; break;
            case 'subtasks': data = { id: `${d.id}-new-${d.subtasks.length}`, ...body, completed: false }; d.subtasks.push(data); break;
          }
        } else data = {};
      }
      return { status: 200, data: clone(data) };
    },
  };
  return api;
};
