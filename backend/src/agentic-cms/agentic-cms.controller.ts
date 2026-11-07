import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_LUMEN_MODEL } from './model/model.provider';
import { TavilySearchClient } from './search/tavily-search.client';
import { SkillLibrary } from './skills/skill-library';

// All agent endpoints belong under this prefix; the global guard protects them.
@Controller('agentic-cms')
export class AgenticCmsController {
  constructor(
    private readonly config: ConfigService,
    private readonly search: TavilySearchClient,
    private readonly skills: SkillLibrary,
  ) {}

  // Configuration check for setup: says whether keys are set, never their values. Makes no external request.
  @Get('status')
  async getStatus() {
    return {
      enabled: true,
      model: this.config.get<string>('LUMEN_MODEL')?.trim() || DEFAULT_LUMEN_MODEL,
      modelConfigured: Boolean(this.config.get<string>('LUMEN_API_KEY')?.trim()),
      webSearchConfigured: this.search.isConfigured(),
      skills: (await this.skills.list()).map((s) => s.name),
    };
  }
}
