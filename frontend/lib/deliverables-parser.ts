export type ParsedDeliverable = {
  title: string;
  rawLine: string;
};

export type DraftDeliverable = {
  id: number;
  title: string;
  assigneeIds: string[];
};

export function reconcileDraftDeliverables(previous: DraftDeliverable[], input: string): DraftDeliverable[] {
  const parsed = parseDashPrefixedDeliverables(input);
  const remaining = new Set(previous);
  // Match unchanged titles first so inserts, deletions, and moves keep their assignments.
  const matches = parsed.map(({ title }) => {
    const match = previous.find(draft => remaining.has(draft) && draft.title === title);
    if (match) remaining.delete(match);
    return match;
  });
  const edited = [...remaining];
  // An equal number of unmatched rows represents title edits. For ambiguous bulk
  // replacements, start new rows unassigned instead of transferring another row's people.
  const preserveEdits = edited.length === matches.filter(match => !match).length;
  let nextId = Math.max(0, ...previous.map(draft => draft.id)) + 1;
  return parsed.map(({ title }, index) => {
    const match = matches[index] ?? (preserveEdits ? edited.shift() : undefined);
    return match ? { ...match, title } : { id: nextId++, title, assigneeIds: [] };
  });
}

export function parseDashPrefixedDeliverables(input: string): ParsedDeliverable[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-+\s*/, '').trim())
    .filter(Boolean)
    .map((title) => ({
      title,
      rawLine: `- ${title}`,
    }));
}
