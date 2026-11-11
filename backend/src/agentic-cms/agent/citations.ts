import type { AgentSource } from './agent.events';
import { sourceIds } from './evidence-tags';

/**
 * Splits the sources found this turn by whether the answer cited them. Numbers
 * the model cited that match no source are returned as `invalid` for logging.
 * Grouped and ranged citations ([1, 2], [2-3]) count; S#/I# claim IDs do not.
 */
export function checkCitations(text: string, sources: AgentSource[]) {
  const ids = new Set(sourceIds(text));
  return {
    cited: sources.filter((source) => ids.has(source.id)),
    invalid: [...ids].filter((id) => !sources.some((source) => source.id === id)),
  };
}
