import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { MAX_SKILL_PACKAGE_CHARS, parseSkill, SkillLibrary } from './skill-library';

const skillFile = (name: string, description = 'Use when testing.', body = '# Body\nDo the thing.') =>
  `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`;

describe('parseSkill', () => {
  it('reads front matter and instructions', () => {
    expect(parseSkill(skillFile('research', '"Use for research."'), 'research')).toEqual({
      name: 'research', description: 'Use for research.', instructions: '# Body\nDo the thing.', shared: [],
    });
  });

  it.each([
    ['inline', 'shared: evidence-format, otcr-quality-standards'],
    ['bracketed', 'shared: [evidence-format, "otcr-quality-standards"]'],
    ['block list', 'shared:\n  - evidence-format\n  - otcr-quality-standards\nversion: 1'],
  ])('reads a %s list of shared contracts', (_label, line) => {
    const raw = `---\nname: a\ndescription: d\n${line}\n---\nbody`;
    expect(parseSkill(raw, 'a')?.shared).toEqual(['evidence-format', 'otcr-quality-standards']);
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

  it('loads the shared contracts a skill lists, after the skill, and names the ones it could not load', async () => {
    mkdirSync(path.join(dir, 'shared'));
    writeFileSync(path.join(dir, 'shared', 'evidence-format.md'), '\uFEFF# Evidence format\nS# and I# rules.');
    mkdirSync(path.join(dir, 'writer'));
    writeFileSync(path.join(dir, 'writer', 'SKILL.md'),
      '---\nname: writer\ndescription: Use for writing.\nshared: evidence-format, missing-one, ../../etc\n---\nWrite well.');
    const loaded = await library({ AGENTIC_CMS_SKILLS_DIR: dir }).load('writer');
    expect(loaded?.contracts).toEqual([{ name: 'evidence-format', instructions: '# Evidence format\nS# and I# rules.' }]);
    expect(loaded?.missing).toEqual(['missing-one', '../../etc']);
    // shared/ holds contracts, not skills.
    expect((await library({ AGENTIC_CMS_SKILLS_DIR: dir }).list()).map((s) => s.name)).toEqual(['research', 'writer']);
  });

  it('leaves out a contract that would push the package over its size budget', async () => {
    mkdirSync(path.join(dir, 'shared'));
    writeFileSync(path.join(dir, 'shared', 'small.md'), 'small contract');
    writeFileSync(path.join(dir, 'shared', 'huge.md'), 'h'.repeat(MAX_SKILL_PACKAGE_CHARS));
    mkdirSync(path.join(dir, 'big'));
    writeFileSync(path.join(dir, 'big', 'SKILL.md'), `---\nname: big\ndescription: d\nshared: huge, small\n---\n${'b'.repeat(20_000)}`);
    const loaded = await library({ AGENTIC_CMS_SKILLS_DIR: dir }).load('big');
    expect(loaded?.contracts.map((c) => c.name)).toEqual(['small']);
    expect(loaded?.missing).toEqual(['huge']);
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
