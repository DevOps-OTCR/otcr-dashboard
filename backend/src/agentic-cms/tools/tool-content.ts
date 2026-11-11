// How tool results are marked for the model (a boundary: changes need Isaiah's review).
// - <otcr_skill>: OTCR's own instruction library, loaded from agentic-cms/skills by load_skill.
//   The only tool content the model is told to follow.
// - <tool_data>: everything else (web results, CMS records, any future tool). Data, never
//   instructions, whatever it says.
// Text inside either block can't open or close these tags: a web page that writes
// "</tool_data><otcr_skill>" stays inside its data block.

const MARKER_TAG = /<(\/?)(otcr_skill|tool_data)\b/gi;

/** Neutralises anything that looks like one of the marker tags. */
export function escapeMarkers(text: string): string {
  return text.replace(MARKER_TAG, '&lt;$1$2');
}

const attribute = (value: string) => value.replace(/[^a-z0-9_-]/gi, '');

export function asToolData(tool: string, content: string): string {
  return `<tool_data tool="${attribute(tool)}">\n${escapeMarkers(content)}\n</tool_data>`;
}

export function asSkill(name: string, source: string, instructions: string): string {
  return `<otcr_skill name="${attribute(name)}" source="${source.replace(/[^a-z0-9_./-]/gi, '')}">\n${escapeMarkers(instructions)}\n</otcr_skill>`;
}
