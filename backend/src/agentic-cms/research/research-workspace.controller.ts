import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { CmsReader } from '../authorization/cms-read-access.service';
import { ResearchWorkspaceService } from './research-workspace.service';

type ResearchRequest = { user: CmsReader };

// Inherits verified authentication and pilot gating from the global guard.
@Controller('agentic-cms/research/projects/:projectId/deliverables/:deliverableId')
export class ResearchWorkspaceController {
  constructor(private readonly research: ResearchWorkspaceService) {}

  @Post()
  initialize(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string, @Req() req: ResearchRequest) {
    return this.research.initialize(req.user, projectId, deliverableId);
  }

  @Get()
  read(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string, @Req() req: ResearchRequest) {
    return this.research.read(req.user, projectId, deliverableId);
  }

  @Put()
  save(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string, @Body() body: unknown, @Req() req: ResearchRequest) {
    return this.research.save(req.user, projectId, deliverableId, body);
  }

  @Patch('sections/:sectionId')
  edit(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string, @Param('sectionId') sectionId: string, @Body() body: unknown, @Req() req: ResearchRequest) {
    return this.research.editSection(req.user, projectId, deliverableId, sectionId, body);
  }

  @Get('revisions')
  history(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string, @Query() query: unknown, @Req() req: ResearchRequest) {
    return this.research.history(req.user, projectId, deliverableId, query);
  }

  @Post('restore')
  restore(@Param('projectId') projectId: string, @Param('deliverableId') deliverableId: string, @Body() body: unknown, @Req() req: ResearchRequest) {
    return this.research.restore(req.user, projectId, deliverableId, body);
  }
}
