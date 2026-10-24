export type ParsedDeliverable = {
  title: string;
  rawLine: string;
};

export type DraftDeliverable = {
  id: number;
  title: string;
  description: string;
  assigneeIds: string[];
  deadline: string;
};

export function createDraftDeliverable(initial?: Partial<DraftDeliverable>): DraftDeliverable {
  return {
    id: 1,
    title: '',
    description: '',
    assigneeIds: [],
    deadline: '',
    ...initial,
  };
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
