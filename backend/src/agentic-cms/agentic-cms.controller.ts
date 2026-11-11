import { Body, Controller, Delete, Get, Param, Post, Put, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CmsReadAccessService, CmsReader } from './authorization/cms-read-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { DEFAULT_LUMEN_MODEL } from './model/model.provider';
import { TavilySearchClient } from './search/tavily-search.client';
import { SkillLibrary } from './skills/skill-library';

type ContextRequest = { user: CmsReader };

// All agent endpoints belong under this prefix; the global guard protects them.
@Controller('agentic-cms')
export class AgenticCmsController {
  constructor(
    private readonly access: CmsReadAccessService,
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
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

  @Get('context/projects/:projectId')
  async getContext(@Param('projectId') projectId: string, @Req() req: ContextRequest) {
    const canEdit = await this.access.canWriteContext(req.user, projectId);
    this.flags.assertAgenticCmsEnabledFor(req.user.email);
    const [project, notes] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, overview: true, scope: true } }),
      this.prisma.projectContextNote.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } }),
    ]);
    if (!project) throw new NotFoundException();
    this.flags.assertAgenticCmsEnabledFor(req.user.email);
    return { project, notes, canEdit };
  }

  @Put('context/projects/:projectId')
  async saveContext(@Param('projectId') projectId: string, @Body() body: { overview?: string; scope?: string }, @Req() req: ContextRequest) {
    await this.access.assertContextWrite(req.user, projectId);
    if (typeof body?.overview !== 'string' || typeof body?.scope !== 'string') throw new BadRequestException('Overview and scope must be text');
    this.flags.assertAgenticCmsEnabledFor(req.user.email);
    return this.prisma.project.update({ where: { id: projectId }, data: { overview: body.overview, scope: body.scope }, select: { id: true, overview: true, scope: true } });
  }

  @Post('context/projects/:projectId/notes')
  async addNote(@Param('projectId') projectId: string, @Body() body: { title: string; content: string }, @Req() req: ContextRequest) {
    await this.access.assertContextWrite(req.user, projectId);
    if (typeof body?.title !== 'string' || typeof body?.content !== 'string') throw new BadRequestException('Title and note text are required');
    const title = body.title.trim(); const content = body.content.trim();
    if (!title || !content) throw new BadRequestException('Title and note text are required');
    this.flags.assertAgenticCmsEnabledFor(req.user.email);
    return this.prisma.projectContextNote.create({ data: { projectId, title, content } });
  }

  @Delete('context/projects/:projectId/notes/:noteId')
  async deleteNote(@Param('projectId') projectId: string, @Param('noteId') noteId: string, @Req() req: ContextRequest) {
    await this.access.assertContextWrite(req.user, projectId);
    const found = await this.prisma.projectContextNote.findFirst({ where: { id: noteId, projectId }, select: { id: true } });
    if (!found) return { deleted: false };
    this.flags.assertAgenticCmsEnabledFor(req.user.email);
    await this.prisma.projectContextNote.delete({ where: { id: noteId, projectId } });
    return { deleted: true };
  }
}
