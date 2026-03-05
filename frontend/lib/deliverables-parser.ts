export type ParsedDeliverable = {
  title: string;
  rawLine: string;
};

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
