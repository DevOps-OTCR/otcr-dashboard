import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseSkill } from '../../skills/skill-library';
const ROOT = '/home/user/wt171/agentic-cms/skills';
it('sizes', async () => {
  const shared: Record<string, number> = {};
  for (const f of ['base-prompt.md','evidence-format.md','otcr-quality-standards.md','workflows.md'])
    shared[f] = (await fs.readFile(path.join(ROOT,'shared',f),'utf8')).length;
  for (const s of ['research','whitepaper-writing','consulting-slides']) {
    const raw = await fs.readFile(path.join(ROOT,s,'SKILL.md'),'utf8');
    const sk = parseSkill(raw, s)!;
    const ev = shared['evidence-format.md'] + shared['otcr-quality-standards.md'];
    const all = Object.values(shared).reduce((a,b)=>a+b,0);
    console.log(s, 'body', sk.instructions.length, 'truncatedNow', sk.instructions.length>=40000, '+ev+qual', sk.instructions.length+ev, '+all', sk.instructions.length+all, 'mentions shared', (raw.match(/shared\/[a-z-]+\.md/g)||[]).join(','));
  }
  console.log(shared);
});
