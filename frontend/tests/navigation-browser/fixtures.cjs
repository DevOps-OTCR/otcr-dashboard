const projects = [{ id: 'team-1', name: 'Team One', googleCalendarId: 'team-1@example.test' }, { id: 'team-2', name: 'Team Two' }];
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
  const poll = { id: 'poll-1', projectId: 'team-1', title: 'Planning poll', createdAt: '2026-10-10' };
  if (pathname === '/when2meet/polls') return { polls: [poll] };
  if (pathname === '/when2meet/polls/poll-1') return { poll,
    grid: { numCols: 1, numRows: 2, totalSlots: 2, slotStartMinute: 540, slotEndMinute: 570,
      gridFirstDate: '2026-10-12', gridLastDate: '2026-10-12', columnLabels: ['Monday'], rowStartLabels: ['9:00', '9:15'] },
    teamSize: 1, members: [{ id: 'u-1', email: 'pm@example.test', displayName: 'PM' }],
    slots: [{ slotIndex: 0, names: ['PM'] }], mySlots: [0] };

  return [];
};
