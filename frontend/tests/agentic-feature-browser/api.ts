export const api = {
  async get(url: string, options: { headers: Record<string, string> }) {
    const result = await fetch(`/api${url}`, { headers: options.headers });
    if (!result.ok) throw new Error('Flag lookup failed');
    return { data: await result.json() };
  },
};
