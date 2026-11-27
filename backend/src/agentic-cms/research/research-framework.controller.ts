import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { CmsReader } from '../authorization/cms-read-access.service';
import { ResearchFrameworkService } from './research-framework.service';

@Controller('agentic-cms/research/projects/:projectId/deliverables/:deliverableId/framework')
export class ResearchFrameworkController {
  constructor(private readonly framework: ResearchFrameworkService) {}
  @Post('generate')
  generate(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string,
    @Body() body: unknown, @Req() req: { user: CmsReader }) {
    return this.framework.generate(req.user, projectId, deliverableId, body);
  }
}
