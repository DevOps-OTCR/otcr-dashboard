import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { CmsReader } from '../authorization/cms-read-access.service';
import { parseResearch } from './research.schemas';
import { researchEditInput } from './research-edit.schemas';
import { ResearchEditService } from './research-edit.service';
@Controller('agentic-cms/research/projects/:projectId/deliverables/:deliverableId')
export class ResearchEditController {
  constructor(private readonly edits: ResearchEditService) {}
  @Post('bot-edit')
  edit(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string, @Body() body: unknown, @Req() req: { user: CmsReader }) {
    return this.edits.edit(req.user, projectId, deliverableId, parseResearch(researchEditInput, body));
  }
}
