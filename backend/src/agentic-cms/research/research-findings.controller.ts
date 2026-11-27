import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CmsReader } from '../authorization/cms-read-access.service';
import { parseResearch } from './research.schemas';
import { findingsInput } from './research-findings.schemas';
import { ResearchFindingsService } from './research-findings.service';

@Controller('agentic-cms/research/projects/:projectId/deliverables/:deliverableId/findings')
export class ResearchFindingsController {
  constructor(private readonly findings: ResearchFindingsService) {}
  @Get('capabilities')
  capabilities(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string, @Req() req: { user: CmsReader }) {
    return this.findings.capabilities(req.user, projectId, deliverableId);
  }
  @Post('buckets/:bucketId/research')
  research(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string, @Param('bucketId') bucketId: string,
    @Body() body: unknown, @Req() req: { user: CmsReader }) {
    return this.findings.research(req.user, projectId, deliverableId, bucketId, parseResearch(findingsInput, body));
  }
}
