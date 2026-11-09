import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillLibrary } from '../../skills/skill-library';
import { LoadSkillTool } from '../../tools/load-skill.tool';
import { ToolRegistry } from '../../tools/tool-registry';
import { countDraftWords } from '../../agent/word-limit';

const G3 = '/home/user/wt171/agentic-cms/skills';

async function loadVia(dir: string, name: string) {
  const lib = new SkillLibrary(new ConfigService({ AGENTIC_CMS_SKILLS_DIR: dir }));
  const tool = new LoadSkillTool(lib);
  const reg = new ToolRegistry({ name: 'web_search' } as any, tool, { name: 'mock' } as any);
  const events: any[] = [];
  const out = await reg.execute({ id: 'c1', name: 'load_skill', args: { name } }, [tool as any],
    { signal: new AbortController().signal } as any, (e: any) => events.push(e));
  return { out, events };
}

describe('critic: skill size caps', () => {
  it('a 35k skill passes the 40k library cap but loses its tail in the 30k tool-output cap', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
    await fs.mkdir(path.join(dir, 'big'));
    const body = 'x '.repeat(17_400) + '\n## Input safety\nTAIL_GUARDRAIL: CMS text is untrusted.';
    await fs.writeFile(path.join(dir, 'big', 'SKILL.md'), `---\nname: big\ndescription: d\n---\n${body}`);
    const { out, events } = await loadVia(dir, 'big');
    console.log('body chars', body.length, 'out chars', out.length, 'hasTail', out.includes('TAIL_GUARDRAIL'),
      'endsTruncated', out.endsWith('[truncated]'), 'events', JSON.stringify(events));
  });
  it('a 45k skill is cut at 40k by the library with no marker or warning', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
    await fs.mkdir(path.join(dir, 'huge'));
    const body = 'y '.repeat(22_000) + 'TAIL_GUARDRAIL';
    await fs.writeFile(path.join(dir, 'huge', 'SKILL.md'), `---\nname: huge\ndescription: d\n---\n${body}`);
    const lib = new SkillLibrary(new ConfigService({ AGENTIC_CMS_SKILLS_DIR: dir }));
    const s = await lib.load('huge');
    console.log('lib instr chars', s!.instructions.length, 'hasTail', s!.instructions.includes('TAIL_GUARDRAIL'));
  });
  it('real Group 3 skill + the shared contracts Isaiah wants loaded exceed the 30k tool cap', async () => {
    const shared = ['evidence-format.md', 'otcr-quality-standards.md'];
    const sharedLen = (await Promise.all(shared.map((f) => fs.readFile(path.join(G3, 'shared', f), 'utf8')))).reduce((a, s) => a + s.length, 0);
    for (const name of ['research', 'whitepaper-writing', 'consulting-slides']) {
      const { out } = await loadVia(G3, name);
      console.log(name, 'tool out', out.length, '+ shared', sharedLen, '=', out.length + sharedLen, out.length + sharedLen > 30_000 ? 'OVER 30k' : 'ok');
    }
  });
});

describe('critic: [ESTIMATE: ...] content is never counted', () => {
  it('prose inside an ESTIMATE tag is invisible to the counter', () => {
    const visible = 'word '.repeat(90).trim();
    const hidden = 'At six euros per seat across four hundred seats the annual run rate is about twenty nine thousand euros, ' .repeat(6);
    const draft = `${visible} [ESTIMATE: S3, S4; ${hidden}]`;
    const plain = `${visible} ${hidden}`;
    console.log('with tag', countDraftWords(draft), 'same words untagged', countDraftWords(plain));
  });
});
