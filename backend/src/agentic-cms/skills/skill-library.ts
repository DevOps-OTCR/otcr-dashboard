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
  /** Shared contracts this skill needs, from its `shared:` front matter (agentic-cms/skills/shared/<name>.md). */
  shared: string[];
}
export interface SharedContract {
  name: string;
  instructions: string;
}
/** A skill ready to hand to the model: its instructions plus the shared contracts it asked for. */
export interface LoadedSkill extends Skill {
  contracts: SharedContract[];
  /** Contracts that were asked for but are missing, invalid or over the size budget. */
  missing: string[];
}

const SKILL_FILE = 'SKILL.md';
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_SKILL_CHARS = 40_000;
const SHARED_DIR = 'shared';
/** A skill plus its shared contracts. Kept whole: contracts that don't fit are left out and named. */
export const MAX_SKILL_PACKAGE_CHARS = 64_000;
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

  async load(name: string): Promise<LoadedSkill | undefined> {
    if (!SKILL_NAME.test(name)) return undefined;
    const skill = (await this.readAll()).find((s) => s.name === name);
    if (!skill) return undefined;

    // Shared contracts the skill lists, in order, while the whole package fits the budget.
    const contracts: SharedContract[] = [];
    const missing: string[] = [];
    let total = skill.instructions.length;
    for (const contract of skill.shared) {
      const text = SKILL_NAME.test(contract) ? await this.readShared(contract) : undefined;
      if (!text || total + text.length > MAX_SKILL_PACKAGE_CHARS) {
        missing.push(contract);
        this.log.warn(`Skill "${name}": shared contract "${contract}" is missing, invalid or over the size budget.`);
        continue;
      }
      total += text.length;
      contracts.push({ name: contract, instructions: text });
    }
    return { ...skill, contracts, missing };
  }

  private async readShared(name: string): Promise<string | undefined> {
    try {
      const raw = await fs.readFile(path.join(this.directory(), SHARED_DIR, `${name}.md`), 'utf8');
      return raw.replace(/^\uFEFF/, '').trim() || undefined;
    } catch {
      return undefined;
    }
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

/**
 * Parses `---\nname: x\ndescription: y\nshared: a, b\n---\nbody`. The name must match its folder.
 * `shared` also accepts `[a, b]` or an indented `- a` list on the following lines.
 */
export function parseSkill(raw: string, folder: string): Skill | undefined {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return undefined;
  const fields: Record<string, string> = {};
  const shared: string[] = [];
  let listKey: string | undefined;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s*(.+)$/.exec(line);
    if (item && listKey === 'shared') {
      shared.push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    listKey = kv[1].toLowerCase();
    fields[listKey] = unquote(kv[2]);
    if (listKey === 'shared' && fields.shared) {
      shared.push(...fields.shared.replace(/^\[|\]$/g, '').split(',').map(unquote).filter(Boolean));
    }
  }
  const name = fields.name || folder;
  const description = fields.description;
  const instructions = match[2].trim();
  if (name !== folder || !description || !instructions) return undefined;
  return { name, description, instructions: instructions.slice(0, MAX_SKILL_CHARS), shared: [...new Set(shared)] };
}

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}
