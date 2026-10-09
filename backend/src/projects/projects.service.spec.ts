import { ProjectsService } from './projects.service';

// Regression coverage for issue #30: a shared deliverable must surface every
// assignee's latest submission, not just the single newest row overall.
// Prisma is stubbed at the $queryRaw boundary so no database is required.

describe('ProjectsService.listSprints assignee submissions (#30)', () => {
  const sprint = {
    id: 'sprint-1',
    projectId: 'project-1',
    sequenceNumber: 1,
    label: 'Sprint 1',
    weekStartDate: '2026-10-06T00:00:00.000Z',
    weekEndDate: '2026-10-12T00:00:00.000Z',
    status: 'RELEASED',
    configSnapshot: null,
    createdAt: '2026-10-06T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
  };

  const deliverable = {
    id: 'deliverable-1',
    sprintId: 'sprint-1',
    title: 'Week 1 Memo',
    deadline: '2026-10-12T17:00:00.000Z',
    templateKind: 'MEMO',
    dueDateSource: 'SPRINT',
    status: 'IN_PROGRESS',
    completed: false,
  };

  const assignments = [
    { deliverableId: 'deliverable-1', userId: 'user-a', assignedAt: '2026-10-06T00:00:00.000Z', email: 'a@illinois.edu', firstName: 'Ann', lastName: 'Alpha' },
    { deliverableId: 'deliverable-1', userId: 'user-b', assignedAt: '2026-10-06T00:00:00.000Z', email: 'b@illinois.edu', firstName: 'Bob', lastName: 'Beta' },
    { deliverableId: 'deliverable-1', userId: 'user-c', assignedAt: '2026-10-06T00:00:00.000Z', email: 'c@illinois.edu', firstName: 'Cat', lastName: 'Gamma' },
  ];

  function buildService(queryRawImpl: (sql: unknown) => Promise<any[]>) {
    const prisma = { $queryRaw: jest.fn(queryRawImpl) } as any;
    const notificationsService = {} as any;
    return new ProjectsService(prisma, notificationsService);
  }

  // Calls happen in order: sprints, deliverables, assignments, subtasks, submissions.
  function queryRawImplFor(submissions: any[]) {
    const calls = [
      [sprint],
      [deliverable],
      assignments,
      [],
      submissions,
    ];
    let i = 0;
    return () => Promise.resolve(calls[i++] ?? []);
  }

  it('returns each assignee with their own latest submission and marks non-submitters', async () => {
    const submissions = [
      // Newest overall (user-b) — previously this row hid everyone else.
      { id: 'sub-b', deliverableId: 'deliverable-1', fileUrl: 'https://x/b-final', submittedAt: '2026-10-10T12:00:00.000Z', status: 'PENDING_REVIEW', submitterId: 'user-b', submitterEmail: 'b@illinois.edu', submitterFirstName: 'Bob', submitterLastName: 'Beta' },
      // user-a submitted twice — only the newest must surface.
      { id: 'sub-a-new', deliverableId: 'deliverable-1', fileUrl: 'https://x/a-v2', submittedAt: '2026-10-09T12:00:00.000Z', status: 'PENDING_REVIEW', submitterId: 'user-a', submitterEmail: 'a@illinois.edu', submitterFirstName: 'Ann', submitterLastName: 'Alpha' },
      { id: 'sub-a-old', deliverableId: 'deliverable-1', fileUrl: 'https://x/a-v1', submittedAt: '2026-10-08T12:00:00.000Z', status: 'PENDING_REVIEW', submitterId: 'user-a', submitterEmail: 'a@illinois.edu', submitterFirstName: 'Ann', submitterLastName: 'Alpha' },
      // user-c never submitted — no row.
    ];
    const service = buildService(queryRawImplFor(submissions));

    const [result] = await service.listSprints('project-1');
    const [item] = result.deliverables;

    expect(item.assigneeSubmissions).toHaveLength(3);

    const byUser = new Map<string, any>(item.assigneeSubmissions.map((entry: any) => [entry.assignee.id, entry]));
    expect(byUser.get('user-a')?.submission?.fileUrl).toBe('https://x/a-v2');
    expect(byUser.get('user-b')?.submission?.fileUrl).toBe('https://x/b-final');
    expect(byUser.get('user-c')?.submission).toBeNull();
    expect(byUser.get('user-c')?.assignee.email).toBe('c@illinois.edu');

    // Legacy single-latest field still means newest overall (other pages read it).
    expect(item.latestSubmission?.fileUrl).toBe('https://x/b-final');
  });

  it('keeps working for a single-assignee deliverable', async () => {
    const singleAssignments = [assignments[0]];
    const submissions = [
      { id: 'sub-a', deliverableId: 'deliverable-1', fileUrl: 'https://x/a', submittedAt: '2026-10-09T12:00:00.000Z', status: 'PENDING_REVIEW', submitterId: 'user-a', submitterEmail: 'a@illinois.edu', submitterFirstName: 'Ann', submitterLastName: 'Alpha' },
    ];
    const calls = [[sprint], [deliverable], singleAssignments, [], submissions];
    let i = 0;
    const service = buildService(() => Promise.resolve(calls[i++] ?? []));

    const [result] = await service.listSprints('project-1');
    const [item] = result.deliverables;

    expect(item.assigneeSubmissions).toHaveLength(1);
    expect(item.assigneeSubmissions[0].submission?.fileUrl).toBe('https://x/a');
    expect(item.latestSubmission?.fileUrl).toBe('https://x/a');
  });
});
