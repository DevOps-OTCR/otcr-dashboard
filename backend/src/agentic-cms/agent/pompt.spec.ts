import { buildSystemPrompt } from './prompt';

const base = { user: { id: 'u1', email: 'a@illinois.edu', role: 'CONSULTANT' }, projectId: 'proj_123', today: '2026-11-03' };

describe('buildSystemPrompt', () => {
  it('names the bot and its users', () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain('OTCR Bot');
    expect(p).toMatch(/student/i);
  });

  it("includes the user's role, the project, and today's date", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain('CONSULTANT');
    expect(p).toContain('proj_123');
    expect(p).toContain('2026-11-03');
  });

  it('includes the workstream when one is selected, and says so when not', () => {
    expect(buildSystemPrompt({ ...base, sprintId: 'sprint_9' })).toContain('sprint_9');
    expect(buildSystemPrompt(base)).toMatch(/none selected/i);
  });

  it('tells the model not to invent facts it cannot see yet', () => {
    expect(buildSystemPrompt(base)).toMatch(/invent|guess/i);
  });

  it('does not leak the user email into the prompt', () => {
    expect(buildSystemPrompt(base)).not.toContain('a@illinois.edu');
  });
});