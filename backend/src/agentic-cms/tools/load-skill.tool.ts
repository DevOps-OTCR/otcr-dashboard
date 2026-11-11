import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MAX_SKILL_PACKAGE_CHARS, SkillLibrary } from '../skills/skill-library';
import { asSkill } from './tool-content';
import { AgentTool, ToolFailure } from './tool.types';

const input = z.object({
  name: z.string().min(1).max(64).describe('Skill name exactly as listed in the system prompt'),
});

/** Lets the model load a skill's full instructions when the task matches its description. */
@Injectable()
export class LoadSkillTool implements AgentTool<typeof input> {
  readonly name = 'load_skill';
  readonly description =
    'Load the full instructions for one of the listed skills. Call this before doing a task that matches a ' +
    "skill's description, then follow the instructions.";
  readonly input = input;
  /** Skills are OTCR's own instruction library (agentic-cms/skills), so the model follows them. */
  readonly returnsInstructions = true;
  /** The library keeps a skill and its contracts within budget, so they always arrive whole. */
  readonly maxOutputChars = MAX_SKILL_PACKAGE_CHARS + 2_000;

  constructor(private readonly skills: SkillLibrary) {}

  async isAvailable() {
    return (await this.skills.list()).length > 0;
  }

  label({ name }: z.infer<typeof input>) {
    return `Loading the "${name}" skill`;
  }

  async run({ name }: z.infer<typeof input>) {
    const skill = await this.skills.load(name);
    if (!skill) {
      const names = (await this.skills.list()).map((s) => s.name).join(', ');
      throw new ToolFailure('Skill not found', `No skill named "${name}". Available skills: ${names || 'none'}.`);
    }
    const unavailable = skill.missing.length
      ? `\n\n(Shared contracts not available: ${skill.missing.join(', ')}. Follow this skill's own rules for them.)`
      : '';
    const blocks = [
      asSkill(skill.name, `agentic-cms/skills/${skill.name}/SKILL.md`, skill.instructions + unavailable),
      // Shared contracts the skill depends on, after the skill itself.
      ...skill.contracts.map((c) => asSkill(c.name, `agentic-cms/skills/shared/${c.name}.md`, c.instructions)),
    ];
    return {
      content: blocks.join('\n\n'),
      note: skill.contracts.length ? `${skill.name} + ${skill.contracts.map((c) => c.name).join(', ')}` : skill.name,
    };
  }
}
