import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { CmsReader } from '../authorization/cms-read-access.service';
import { parseResearch } from './research.schemas';
import { PastDataRetrievalService } from './past-data-retrieval.service';
import { pastDataInput, pastDataPreviewInput, ResearchPastDataService } from './research-past-data.service';

@Controller('agentic-cms/research/projects/:projectId/deliverables/:deliverableId/past-data')
export class ResearchPastDataController {
  constructor(private readonly past: ResearchPastDataService, private readonly retrieval: PastDataRetrievalService) {}
  @Get()
  status(@Param('projectId') project: string, @Param('deliverableId') deliverable: string, @Req() req: { user: CmsReader }) {
    return this.past.status(req.user, project, deliverable);
  }
  @Post('preview')
  preview(@Param('projectId') project: string, @Param('deliverableId') deliverable: string, @Body() body: unknown, @Req() req: { user: CmsReader }) {
    const input = parseResearch(pastDataPreviewInput, body);
    return this.past.preview(req.user, project, deliverable, input.focus);
  }
  @Post('generate')
  generate(@Param('projectId') project: string, @Param('deliverableId') deliverable: string, @Body() body: unknown, @Req() req: { user: CmsReader }) {
    const input = parseResearch(pastDataInput, body);
    return this.past.schedule(req.user, project, deliverable, input.focus, input.expectedVersion);
  }
  @Get('source')
  source(@Param('projectId') project: string, @Param('deliverableId') deliverable: string, @Query() query: unknown, @Req() req: { user: CmsReader }) {
    const input = parseResearch(z.strictObject({ kind: z.enum(['overview', 'scope', 'note', 'workstream', 'deliverable', 'feedback', 'research']), recordId: z.string().min(1).max(200) }), query);
    return this.retrieval.readSource(req.user, project, deliverable, input.kind, input.recordId);
  }
}
