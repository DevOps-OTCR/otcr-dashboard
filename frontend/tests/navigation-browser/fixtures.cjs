const projects = [{ id: 'team-1', name: 'Team One' }, { id: 'team-2', name: 'Team Two' }];
function sprints(projectId) {
  return [{
    id: `${projectId}-week-1`, label: 'Week 1', status: 'RELEASED',
    weekStartDate: '2026-10-12', weekEndDate: '2026-10-18',
    deliverables: [
      { id: `${projectId}-research`, title: `${projectId} Research`, status: 'IN_PROGRESS', deadline: '2026-10-18T23:00:00Z', assignees: [], subtasks: [] },
      { id: `${projectId}-slides`, title: `${projectId} Draft deck`, templateKind: 'INITIAL_SLIDES', status: 'IN_PROGRESS', deadline: '2026-10-18T23:00:00Z', assignees: [{ id: 'u-1', email: 'consultant@example.test', firstName: 'Test' }] },
    ],
  }];
}
const events = [{
  id: 'event-1', title: 'Team weekly check-in', eventDate: '2099-10-12T17:00:00Z',
  locationType: 'ONLINE', locationLabel: 'Online', audienceScope: 'TEAM', category: 'TEAM_MEETING',
  projectId: 'team-1', projectName: 'Team One', createdById: 'u-1', createdByName: 'Test PM',
  canManage: true, canControlOnlineCode: true, verificationCode: null,
  codeWindowOpensAt: null, codeWindowClosesAt: null, availabilityPoll: null,
  attendanceCount: 0, attendance: null,
}];
exports.responseFor = (pathname, role) => {
  if (pathname === '/auth/role') return { role };
  if (pathname === '/projects') return { projects };
  const sprintMatch = pathname.match(/^\/projects\/(.+)\/sprints$/);
  if (sprintMatch) return sprints(sprintMatch[1]);
  if (pathname.startsWith('/projects/')) return { pm: { id: 'u-1', firstName: 'Test', email: 'pm@example.test' }, members: [] };
  if (pathname === '/attendance/events') return { events };
  return [];
};
