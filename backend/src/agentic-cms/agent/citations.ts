import type { AgentSource } from './agent.events';

/**
 * Splits the sources found this turn by whether the answer cited them. Numbers
 * the model cited that match no source are returned as `invalid` for logging.
 */
export function checkCitations(text: string, sources: AgentSource[]) {
  const ids = new Set([...text.matchAll(/\[(\d+)\](?!\()/g)].map((match) => Number(match[1])));
  return {
    cited: sources.filter((source) => ids.has(source.id)),
    invalid: [...ids].filter((id) => !sources.some((source) => source.id === id)),
  };
}
