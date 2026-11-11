import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SkillLibrary } from '../skills/skill-library';
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
    return {
      content: `Skill "${skill.name}" instructions. Follow them for this task:\n\n${skill.instructions}`,
      note: skill.name,
    };
  }
}
