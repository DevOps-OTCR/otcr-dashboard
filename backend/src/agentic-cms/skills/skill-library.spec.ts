import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parseSkill, SkillLibrary } from './skill-library';

const skillFile = (name: string, description = 'Use when testing.', body = '# Body\nDo the thing.') =>
  `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`;

describe('parseSkill', () => {
  it('reads front matter and instructions', () => {
    expect(parseSkill(skillFile('research', '"Use for research."'), 'research')).toEqual({
      name: 'research', description: 'Use for research.', instructions: '# Body\nDo the thing.',
    });
  });

  it('handles Windows line endings and a byte-order mark', () => {
    expect(parseSkill(`\uFEFF${skillFile('a').replace(/\n/g, '\r\n')}`, 'a')?.description).toBe('Use when testing.');
  });

  it('rejects missing front matter, description, body, or a name that does not match the folder', () => {
    expect(parseSkill('# just markdown', 'a')).toBeUndefined();
    expect(parseSkill('---\nname: a\n---\nbody', 'a')).toBeUndefined();
    expect(parseSkill(skillFile('a', 'desc', ''), 'a')).toBeUndefined();
    expect(parseSkill(skillFile('other'), 'a')).toBeUndefined();
  });
});

describe('SkillLibrary', () => {
  let dir: string;
  const library = (settings: Record<string, string>) => new SkillLibrary({ get: (k: string) => settings[k] } as never);
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'skills-'));
    for (const [folder, content] of [
      ['research', skillFile('research')],
      ['broken', 'no front matter'],
      ['Bad_Name', skillFile('Bad_Name')],
    ]) {
      mkdirSync(path.join(dir, folder));
      writeFileSync(path.join(dir, folder, 'SKILL.md'), content);
    }
    mkdirSync(path.join(dir, 'resources-only'));
    writeFileSync(path.join(dir, 'README.md'), 'not a skill');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists valid skills from AGENTIC_CMS_SKILLS_DIR and skips invalid folders', async () => {
    const skills = library({ AGENTIC_CMS_SKILLS_DIR: dir });
    expect(await skills.list()).toEqual([{ name: 'research', description: 'Use when testing.' }]);
    expect((await skills.load('research'))?.instructions).toContain('Do the thing.');
  });

  it('refuses names that could escape the skills folder', async () => {
    const skills = library({ AGENTIC_CMS_SKILLS_DIR: dir });
    for (const name of ['../research', 'research/../research', '..', '/etc/passwd', 'Bad_Name']) {
      expect(await skills.load(name)).toBeUndefined();
    }
  });

  it('works without a skills folder', async () => {
    expect(await library({ AGENTIC_CMS_SKILLS_DIR: path.join(dir, 'missing') }).list()).toEqual([]);
  });

  it("finds the repository's agentic-cms/skills folder by default", async () => {
    const names = (await library({}).list()).map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['research', 'whitepaper-writing', 'consulting-slides']));
    expect(names).not.toContain('sample-executive-summary');
  });
});
