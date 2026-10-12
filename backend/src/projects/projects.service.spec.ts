import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type SubmissionRow = {
  id: string;
  deliverableId: string;
  fileUrl: string;
  submittedAt: string;
  status: string;
  submitterId: string;
  submitterEmail: string;
  submitterFirstName: string;
  submitterLastName: string;
};

type SubmissionResult = {
  submitter: { id: string; email: string };
  fileUrl: string;
};

// Regression coverage for issue #30: a shared deliverable must surface every
// submitter's latest submission, including people who are not assigned.
// Prisma is stubbed at the $queryRaw boundary so no database is required.

describe('ProjectsService.listSprints submissions (#30)', () => {
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

  function buildService(queryRawImpl: (sql: unknown) => Promise<unknown[]>) {
    const prisma = { $queryRaw: jest.fn(queryRawImpl) } as unknown as PrismaService;
    const notificationsService = {} as NotificationsService;
    return new ProjectsService(prisma, notificationsService);
  }

  // Calls happen in order: sprints, deliverables, assignments, subtasks, submissions.
  function queryRawImplFor(submissions: SubmissionRow[], assignedUsers = assignments) {
    const calls = [
      [sprint],
      [deliverable],
      assignedUsers,
      [],
      submissions,
    ];
    let i = 0;
    return () => Promise.resolve(calls[i++] ?? []);
  }

  it('returns each submitter\'s latest submission and preserves the assignment list', async () => {
    const submissions = [
      // Newest overall (user-b) - previously this row hid everyone else.
      { id: 'sub-b', deliverableId: 'deliverable-1', fileUrl: 'https://x/b-final', submittedAt: '2026-10-10T12:00:00.000Z', status: 'PENDING_REVIEW', submitterId: 'user-b', submitterEmail: 'b@illinois.edu', submitterFirstName: 'Bob', submitterLastName: 'Beta' },
      // SQL returns only user-a's newest revision.
      { id: 'sub-a-new', deliverableId: 'deliverable-1', fileUrl: 'https://x/a-v2', submittedAt: '2026-10-09T12:00:00.000Z', status: 'PENDING_REVIEW', submitterId: 'user-a', submitterEmail: 'a@illinois.edu', submitterFirstName: 'Ann', submitterLastName: 'Alpha' },
      // user-c never submitted - no row.
    ];
    const service = buildService(queryRawImplFor(submissions));

    const [result] = await service.listSprints('project-1');
    const [item] = result.deliverables;

    expect(item.submissions).toHaveLength(2);
    expect(item.assignees.map((assignee: { id: string }) => assignee.id)).toEqual(['user-a', 'user-b', 'user-c']);
    expect(item).not.toHaveProperty('assigneeSubmissions');

    const byUser = new Map<string, SubmissionResult>(
      item.submissions.map((submission: SubmissionResult) => [submission.submitter.id, submission]),
    );
    expect(byUser.get('user-a')?.fileUrl).toBe('https://x/a-v2');
    expect(byUser.get('user-b')?.fileUrl).toBe('https://x/b-final');
    expect(byUser.has('user-c')).toBe(false);

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

    expect(item.submissions).toHaveLength(1);
    expect(item.submissions[0].fileUrl).toBe('https://x/a');
    expect(item.latestSubmission?.fileUrl).toBe('https://x/a');
  });

  const managerSubmission: SubmissionRow = {
    id: 'sub-pm', deliverableId: 'deliverable-1', fileUrl: 'https://x/pm',
    submittedAt: '2026-10-08T12:00:00.000Z', status: 'PENDING_REVIEW',
    submitterId: 'user-pm', submitterEmail: 'pm@illinois.edu',
    submitterFirstName: 'Project', submitterLastName: 'Manager',
  };

  it('preserves multiple unassigned manager submissions after an assignee submits later', async () => {
    const submissions: SubmissionRow[] = [
      managerSubmission,
      { ...managerSubmission, id: 'sub-lc', submitterId: 'user-lc', fileUrl: 'https://x/lc' },
      { ...managerSubmission, id: 'sub-a', submitterId: 'user-a', fileUrl: 'https://x/a', submittedAt: '2026-10-10T12:00:00.000Z' },
    ];
    const [result] = await buildService(queryRawImplFor(submissions)).listSprints('project-1');
    const [item] = result.deliverables;

    expect(item.submissions.map((submission: SubmissionResult) => submission.fileUrl)).toEqual([
      'https://x/pm', 'https://x/lc', 'https://x/a',
    ]);
    expect(item.latestSubmission.fileUrl).toBe('https://x/a');
  });

  it('returns manager submissions when there are no assignments', async () => {
    const [result] = await buildService(queryRawImplFor([managerSubmission], [])).listSprints('project-1');
    const [item] = result.deliverables;

    expect(item.assignees).toEqual([]);
    expect(item.submissions).toHaveLength(1);
    expect(item.submissions[0].fileUrl).toBe('https://x/pm');
  });

  it('returns an assigned manager\'s submission once', async () => {
    const managerAssignment = { ...assignments[0], userId: 'user-pm', email: 'pm@illinois.edu' };
    const [result] = await buildService(queryRawImplFor([managerSubmission], [managerAssignment])).listSprints('project-1');
    const [item] = result.deliverables;

    expect(item.submissions).toHaveLength(1);
    expect(item.submissions[0].submitter.id).toBe('user-pm');
  });

  it('returns an empty submission list while retaining assignees who have not submitted', async () => {
    const [result] = await buildService(queryRawImplFor([])).listSprints('project-1');
    const [item] = result.deliverables;

    expect(item.submissions).toEqual([]);
    expect(item.assignees).toHaveLength(3);
    expect(item.latestSubmission).toBeNull();
  });
});
