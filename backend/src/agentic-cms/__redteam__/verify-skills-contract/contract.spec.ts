import { SkillLibrary } from '../../skills/skill-library';
const lib = new SkillLibrary({ get: () => '/home/user/wt171/agentic-cms/skills' } as any);
const sharedOnly = ['Redact PII', 'client-safe description', 'background-only` rows never appear', 'Retire, do not delete', 'Skills grant no permissions', 'UNSOURCED IN SOURCE DOC', 'internal identifiers'];
it('probe', async () => {
  const names = (await lib.list()).map((s) => s.name);
  const out: any = { names, sharedLoad: await lib.load('shared'), sharedEv: await lib.load('shared/evidence-format') };
  for (const n of names) {
    const s = await lib.load(n);
    out[n] = { len: s!.instructions.length, hits: sharedOnly.filter((m) => s!.instructions.includes(m)), mentionsInternal: /internal (record|ID|identifier)/i.test(s!.instructions), pii: /\bPII\b|personal data|redact/i.test(s!.instructions) };
  }
  console.log(JSON.stringify(out, null, 1));
});
