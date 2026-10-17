import type { When2MeetPollDetail } from '@/lib/api';

export function pollAvailability(detail: When2MeetPollDetail) {
  const members = [...new Map(detail.members.map(member => [member.id, member])).values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.email.localeCompare(b.email));
  const roster = new Set(members.map(member => member.id));
  const recorded = new Set<string>();
  const bySlot = new Map<number, Set<string>>();
  // Cached responses from an older API contain names only; do not guess identities.
  const hasIdentityData = detail.slots.every(slot => Array.isArray(slot.userIds));
  for (const slot of detail.slots) {
    if (!Number.isInteger(slot.slotIndex) || slot.slotIndex < 0 || slot.slotIndex >= detail.grid.totalSlots) continue;
    const ids = bySlot.get(slot.slotIndex) ?? new Set<string>();
    for (const id of slot.userIds ?? []) {
      if (!roster.has(id)) continue;
      ids.add(id);
      recorded.add(id);
    }
    bySlot.set(slot.slotIndex, ids);
  }
  return { members, bySlot, hasIdentityData,
    forSlot(slotIndex: number) {
      const available = bySlot.get(slotIndex) ?? new Set<string>();
      return {
        available: members.filter(member => available.has(member.id)),
        unavailable: members.filter(member => !available.has(member.id) && recorded.has(member.id)),
        unrecorded: members.filter(member => !recorded.has(member.id)),
      };
    },
  };
}
