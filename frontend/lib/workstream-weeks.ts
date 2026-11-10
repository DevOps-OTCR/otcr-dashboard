type SprintDeliverable = { sprintId?: string | null };

// Week membership comes from the sprint association only. Deliverables nested
// under a sprint without an explicit sprintId belong to that sprint; titles and
// list position never decide which week a deliverable appears in.
export function deliverablesInSprint<T extends SprintDeliverable>(sprint: {
  id: string;
  deliverables?: T[] | null;
}): T[] {
  return (sprint.deliverables ?? []).filter(
    (deliverable) => !deliverable.sprintId || deliverable.sprintId === sprint.id,
  );
}
