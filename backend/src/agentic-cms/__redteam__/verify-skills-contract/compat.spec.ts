import { SkillLibrary } from '../../skills/skill-library';
const lib = (s: Record<string,string>) => new SkillLibrary({ get: (k: string) => s[k] } as never);
it('default dir in #176', async () => {
  console.log('default:', (await lib({}).list()).map(s=>s.name));
});
it('group3 library', async () => {
  const l = lib({ AGENTIC_CMS_SKILLS_DIR: '/home/user/wt171/agentic-cms/skills' });
  const list = await l.list();
  console.log('g3:', list.map(s=>`${s.name}:${s.description.length}`));
  for (const s of list) {
    const k = await l.load(s.name);
    console.log(s.name, k!.instructions.length, 'hasEvidenceFormatContent', /Evidence Ledger/.test(k!.instructions), 'loadsSharedFile', false);
  }
  expect(list.map(s=>s.name)).toEqual(['consulting-slides','research','whitepaper-writing']);
});
