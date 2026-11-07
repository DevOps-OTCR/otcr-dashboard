// Pure Server-Sent Events parsing (no imports, so tests/unit can load it directly).
// Network chunks can split a frame anywhere; lines starting with ":" are heartbeats.
export function createSseParser(onData: (json: unknown) => void) {
  let buffer = '';
  return function push(chunk: string) {
    buffer += chunk.replace(/\r\n/g, '\n');
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue; // heartbeat comment
      try {
        onData(JSON.parse(data));
      } catch {
        // Ignore a malformed frame rather than breaking the conversation.
      }
    }
  };
}
