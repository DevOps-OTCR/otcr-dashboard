import { readdirSync, existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { LoadSkillTool } from '../tools/load-skill.tool';
import { MAX_SKILL_PACKAGE_CHARS, parseSkill, SkillLibrary } from './skill-library';

// Compatibility with the skill library checked in at agentic-cms/skills (Group 3's
// research, whitepaper-writing and consulting-slides once they merge). A skill that
// fails here would be silently skipped or loaded incomplete in production.
const SKILLS_DIR = path.resolve(__dirname, '../../../../agentic-cms/skills');
const folders = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(SKILLS_DIR, entry.name, 'SKILL.md')))
  .map((entry) => entry.name);

const library = new SkillLibrary({ get: () => undefined } as never);

describe('checked-in skill library', () => {
  it('has at least one skill', () => {
    expect(folders.length).toBeGreaterThan(0);
  });

  it('lists every folder that has a SKILL.md, and nothing else', async () => {
    expect((await library.list()).map((s) => s.name).sort()).toEqual([...folders].sort());
  });

  describe.each(folders)('%s', (folder) => {
    const raw = readFileSync(path.join(SKILLS_DIR, folder, 'SKILL.md'), 'utf8');

    it('has front matter whose name matches its folder and a one-line description of when to use it', () => {
      const skill = parseSkill(raw, folder);
      expect(skill).toBeDefined();
      expect(skill!.description).not.toMatch(/\n/);
      expect(skill!.description.length).toBeGreaterThan(20);
    });

    it('fits the instruction cap without being cut', () => {
      const body = raw.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
      expect(body.length).toBeLessThanOrEqual(40_000);
    });

    it('loads whole, with every shared contract it lists', async () => {
      const loaded = await library.load(folder);
      expect(loaded?.missing).toEqual([]);
      const size = loaded!.instructions.length + loaded!.contracts.reduce((sum, c) => sum + c.instructions.length, 0);
      expect(size).toBeLessThanOrEqual(MAX_SKILL_PACKAGE_CHARS);
      const out = await new LoadSkillTool(library).run({ name: folder });
      expect(out.content.length).toBeLessThanOrEqual(new LoadSkillTool(library).maxOutputChars);
      expect(out.content.startsWith(`<otcr_skill name="${folder}"`)).toBe(true);
    });
  });
});
