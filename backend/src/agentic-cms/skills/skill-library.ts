import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface SkillSummary {
  name: string;
  description: string;
}
export interface Skill extends SkillSummary {
  instructions: string;
}

const SKILL_FILE = 'SKILL.md';
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_SKILL_CHARS = 40_000;
// backend/{src,dist}/agentic-cms/skills -> repository root -> agentic-cms/skills
const DEFAULT_SKILLS_DIR = path.resolve(__dirname, '../../../../agentic-cms/skills');

/**
 * Reads skills from agentic-cms/skills/<name>/SKILL.md (format: agentic-cms/skills/README.md).
 * Files are read on demand, never at startup. Override the folder with
 * AGENTIC_CMS_SKILLS_DIR. Skills are instructions only; they grant no access.
 */
@Injectable()
export class SkillLibrary {
  private readonly log = new Logger('OtcrBotSkills');

  constructor(private readonly config: ConfigService) {}

  directory(): string {
    const configured = this.config.get<string>('AGENTIC_CMS_SKILLS_DIR')?.trim();
    return configured ? path.resolve(configured) : DEFAULT_SKILLS_DIR;
  }

  async list(): Promise<SkillSummary[]> {
    const skills = await this.readAll();
    return skills.map(({ name, description }) => ({ name, description }));
  }

  async load(name: string): Promise<Skill | undefined> {
    if (!SKILL_NAME.test(name)) return undefined;
    return (await this.readAll()).find((s) => s.name === name);
  }

  private async readAll(): Promise<Skill[]> {
    const dir = this.directory();
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return []; // no skills folder deployed: the bot works without skills
    }
    const skills: Skill[] = [];
    for (const entry of entries.filter((e) => e.isDirectory() && SKILL_NAME.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        const raw = await fs.readFile(path.join(dir, entry.name, SKILL_FILE), 'utf8');
        const skill = parseSkill(raw, entry.name);
        if (skill) skills.push(skill);
        else this.log.warn(`Skipping skill "${entry.name}": ${SKILL_FILE} needs front matter with name and description.`);
      } catch {
        // A folder without SKILL.md (e.g. shared resources) is not a skill.
      }
    }
    return skills;
  }
}

/** Parses `---\nname: x\ndescription: y\n---\nbody`. The name must match its folder. */
export function parseSkill(raw: string, folder: string): Skill | undefined {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return undefined;
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  const name = fields.name || folder;
  const description = fields.description;
  const instructions = match[2].trim();
  if (name !== folder || !description || !instructions) return undefined;
  return { name, description, instructions: instructions.slice(0, MAX_SKILL_CHARS) };
}
