import { WriteApprovals } from './write-approvals';

const owner = { userId: 'u1', projectId: 'p1', conversationId: 'c1' };
const write = { toolName: 'comment_google_doc', input: { comments: ['x'] } };

describe('WriteApprovals', () => {
  afterEach(() => jest.useRealTimers());

  it('returns the stored call once, then forgets it', () => {
    const approvals = new WriteApprovals();
    const id = approvals.create(owner, write);
    expect(approvals.take(id, owner)).toEqual(write);
    expect(approvals.take(id, owner)).toBeNull();
  });

  it.each([
    ['another user', { ...owner, userId: 'u2' }],
    ['another project', { ...owner, projectId: 'p2' }],
    ['another conversation', { ...owner, conversationId: 'c2' }],
  ])('refuses %s, without using the approval up', (_label, other) => {
    const approvals = new WriteApprovals();
    const id = approvals.create(owner, write);
    expect(approvals.take(id, other)).toBeNull();
    expect(approvals.take(id, owner)).toEqual(write);
  });

  it('refuses an id it never issued', () => {
    expect(new WriteApprovals().take('00000000-0000-4000-8000-000000000000', owner)).toBeNull();
  });

  it('expires after 15 minutes', () => {
    jest.useFakeTimers();
    const approvals = new WriteApprovals();
    const id = approvals.create(owner, write);
    jest.advanceTimersByTime(15 * 60 * 1000 - 1);
    expect(approvals.take(id, owner)).toEqual(write);
    const late = approvals.create(owner, write);
    jest.advanceTimersByTime(15 * 60 * 1000);
    expect(approvals.take(late, owner)).toBeNull();
  });

  it('keeps at most 100 pending approvals, dropping the oldest', () => {
    const approvals = new WriteApprovals();
    const ids = Array.from({ length: 101 }, () => approvals.create(owner, write));
    expect(approvals.take(ids[0], owner)).toBeNull();
    expect(approvals.take(ids[100], owner)).toEqual(write);
    expect(approvals.take(ids[1], owner)).toEqual(write);
  });
});
