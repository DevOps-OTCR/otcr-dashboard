import { When2MeetService } from './when2meet.service';
import { PrismaService } from '../prisma/prisma.service';

const person = (id: string, firstName: string) => ({ id, firstName, lastName: 'Lee', email: `${id}@example.test` });
const alex = person('alex', 'Alex');
const otherAlex = person('other-alex', 'Alex');
const pm = person('pm', 'Morgan');

function fixture(rows: Array<{ slotIndex: number; userId: string }> = []) {
  const prisma = {
    when2MeetPoll: { findUnique: jest.fn().mockResolvedValue({
      id: 'poll', title: 'Planning', projectId: 'team', createdAt: new Date(),
      gridFirstDate: new Date('2026-10-15'), gridLastDate: new Date('2026-10-15'),
      slotStartMinute: 540, slotEndMinute: 570,
      availabilities: rows.map(row => ({ ...row, user: person(row.userId, 'Old name') })),
    }) },
    project: { findUnique: jest.fn().mockResolvedValue({
      id: 'team', pm, members: [alex, otherAlex, alex, pm].map(user => ({ user })),
    }) },
  };
  return new When2MeetService(prisma as unknown as PrismaService);
}

describe('When2Meet group availability', () => {
  it('uses unique current roster IDs, keeping same-name people distinct and excluding former members', async () => {
    const service = fixture([
      { slotIndex: 0, userId: 'alex' }, { slotIndex: 0, userId: 'alex' },
      { slotIndex: 1, userId: 'other-alex' }, { slotIndex: 0, userId: 'former' },
      { slotIndex: -1, userId: 'pm' }, { slotIndex: 2, userId: 'pm' },
    ]);
    const result = await service.getPoll({ id: 'alex', role: 'ADMIN' }, 'poll');
    expect(result.teamSize).toBe(3);
    expect(result.members.map(member => member.id)).toEqual(['alex', 'other-alex', 'pm']);
    expect(result.slots).toEqual([
      { slotIndex: 0, userIds: ['alex'], names: ['Alex Lee'] },
      { slotIndex: 1, userIds: ['other-alex'], names: ['Alex Lee'] },
    ]);
    expect(result.mySlots).toEqual([0]);
  });

  it('returns the full team roster even when no availability has been saved', async () => {
    const result = await fixture().getPoll({ id: 'pm', role: 'ADMIN' }, 'poll');
    expect(result.teamSize).toBe(3);
    expect(result.members).toHaveLength(3);
    expect(result.slots).toEqual([]);
    expect(result.mySlots).toEqual([]);
  });
});
