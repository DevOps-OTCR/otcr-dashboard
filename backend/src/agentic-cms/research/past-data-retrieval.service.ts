import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { CmsReadAccessService, CmsReader } from '../authorization/cms-read-access.service';
import { ResearchAccessService } from './research-access.service';
import { documentSchema } from './research.schemas';

export type PastSourceKind = 'overview' | 'scope' | 'note' | 'workstream' | 'deliverable' | 'feedback' | 'research';
export type PastSource = {
  id: string; kind: PastSourceKind; recordId: string; title: string; text: string;
  date: string; url: string; truncated: boolean;
};
export const PAST_DATA_LIMITS = { notes: 60, workstreams: 20, deliverables: 60, sources: 24, sourceChars: 2400 };
const stop = new Set('the and for that with from this into have what which should will research deliverable workstream project sources source findings assessment compare comparison prepare using brief notes'.split(' '));
const words = (text: string) => [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(word => !stop.has(word)))].slice(0, 60);
const notes = (value: Prisma.JsonValue) => value && typeof value === 'object' && !Array.isArray(value) && typeof value.generalNotes === 'string' ? value.generalNotes : '';
export const sourceFingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class PastDataRetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly reads: CmsReadAccessService,
    private readonly access: ResearchAccessService,
    private readonly config: ConfigService,
  ) {}

  async actor(user: CmsReader) {
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const current = await this.prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, role: true, active: true } });
    const enrolled = await this.prisma.allowedEmail.findUnique({ where: { email: user.email }, select: { active: true } });
    this.flags.assertAgenticCmsEnabledFor(user.email);
    if (!current?.active || !enrolled?.active || current.email.toLowerCase() !== user.email.toLowerCase()) this.deny();
    return current;
  }

  async target(user: CmsReader, projectId: string, deliverableId: string, write = false) {
    const actor = await this.actor(user);
    await this.access.check(actor, projectId, deliverableId, write);
    this.flags.assertAgenticCmsEnabledFor(actor.email);
    const target = await this.prisma.deliverable.findFirst({
      where: { id: deliverableId, projectId },
      select: { id: true, title: true, description: true, project: { select: { overview: true, scope: true } }, sprint: { select: { id: true, projectId: true, label: true, weekStartDate: true, status: true, configSnapshot: true } } },
    });
    if (!target || target.sprint?.projectId !== projectId || target.sprint.status !== 'RELEASED') this.deny();
    this.flags.assertAgenticCmsEnabledFor(actor.email);
    return { actor, target, assignment: { title: target.title, brief: target.description ?? '', workstream: target.sprint.label, workstreamNotes: notes(target.sprint.configSnapshot), projectOverview: target.project.overview ?? '', projectScope: target.project.scope ?? '' } };
  }

  async availability(user: CmsReader, projectId: string, deliverableId: string) {
    const actor = await this.actor(user);
    const canEdit = await this.access.check(actor, projectId, deliverableId);
    this.flags.assertAgenticCmsEnabledFor(actor.email);
    const row = await this.prisma.deliverable.findFirst({ where: { id: deliverableId, projectId }, select: { sprint: { select: { projectId: true, status: true } } } });
    this.flags.assertAgenticCmsEnabledFor(actor.email);
    return { canEdit, released: row?.sprint?.projectId === projectId && row.sprint.status === 'RELEASED' };
  }

  private source(projectId: string, deliverableId: string, kind: PastSourceKind, recordId: string, title: string, text: string, date: Date): PastSource {
    const params = new URLSearchParams({ researchProject: projectId, researchDeliverable: deliverableId, researchSourceKind: kind, researchSourceRecord: recordId });
    const base = (this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
    const url = `${base}/agentic-cms?${params}`;
    if (!/^https?:\/\//i.test(url)) throw new Error('Invalid frontend URL');
    return { id: `pd_${sourceFingerprint([kind, recordId]).slice(0, 24)}`, kind, recordId, title: title.slice(0, 450),
      text: text.slice(0, PAST_DATA_LIMITS.sourceChars), date: date.toISOString(), url, truncated: text.length > PAST_DATA_LIMITS.sourceChars };
  }

  private researchText(document: Prisma.JsonValue) {
    const parsed = documentSchema.safeParse(document);
    if (!parsed.success) return '';
    return parsed.data.sections.filter(section => section.tab !== 'past-data' && section.content.trim())
      .map(section => `${section.title}\n${section.content}`).join('\n\n');
  }

  async retrieve(user: CmsReader, projectId: string, deliverableId: string, focus: string) {
    const { actor, target, assignment } = await this.target(user, projectId, deliverableId, true);
    const access = await this.reads.deliverableScope(actor, projectId);
    const weeks = await this.reads.workstreamScope(actor, projectId);
    const before = target.sprint.weekStartDate;
    this.flags.assertAgenticCmsEnabledFor(actor.email);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { overview: true, scope: true, updatedAt: true } });
    this.flags.assertAgenticCmsEnabledFor(actor.email);
    const callNotes = await this.prisma.projectContextNote.findMany({ where: { projectId, createdAt: { lte: new Date() } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: PAST_DATA_LIMITS.notes + 1 });
    this.flags.assertAgenticCmsEnabledFor(actor.email);
    const workstreams = await this.prisma.sprint.findMany({
      where: { AND: [weeks.where, { projectId, status: 'RELEASED', weekStartDate: { lt: before } }] },
      select: { id: true, label: true, configSnapshot: true, updatedAt: true }, orderBy: [{ weekStartDate: 'desc' }, { id: 'asc' }], take: PAST_DATA_LIMITS.workstreams + 1,
    });
    this.flags.assertAgenticCmsEnabledFor(actor.email);
    const deliverables = await this.prisma.deliverable.findMany({
      where: { AND: [access.where, { sprint: { is: { projectId, status: 'RELEASED', weekStartDate: { lt: before } } } }] },
      select: { id: true, title: true, description: true, updatedAt: true,
        researchWorkspace: { select: { document: true, updatedAt: true } },
        submissions: { where: { feedback: { not: null } }, select: { id: true, feedback: true, reviewedAt: true, submittedAt: true }, orderBy: { submittedAt: 'desc' }, take: 3 },
      }, orderBy: [{ deadline: 'desc' }, { id: 'asc' }], take: PAST_DATA_LIMITS.deliverables + 1,
    });
    const candidates: PastSource[] = [];
    const add = (kind: PastSourceKind, id: string, title: string, text: string, date: Date) => {
      if (text?.trim()) candidates.push(this.source(projectId, deliverableId, kind, id, title, text, date));
    };
    add('overview', projectId, 'Project overview', project?.overview, project?.updatedAt);
    add('scope', projectId, 'Project scope / SOW', project?.scope, project?.updatedAt);
    for (const row of callNotes.slice(0, PAST_DATA_LIMITS.notes)) add('note', row.id, row.title, row.content, row.createdAt);
    for (const row of workstreams.slice(0, PAST_DATA_LIMITS.workstreams)) add('workstream', row.id, row.label, notes(row.configSnapshot), row.updatedAt);
    for (const row of deliverables.slice(0, PAST_DATA_LIMITS.deliverables)) {
      add('deliverable', row.id, `${row.title} — assignment brief`, row.description, row.updatedAt);
      if (row.researchWorkspace) add('research', row.id, `${row.title} — saved research`, this.researchText(row.researchWorkspace.document), row.researchWorkspace.updatedAt);
      for (const submission of row.submissions) add('feedback', submission.id, `${row.title} — recorded feedback`, submission.feedback, submission.reviewedAt ?? submission.submittedAt);
    }
    const queryTerms = words(`${assignment.title} ${assignment.brief} ${assignment.workstreamNotes} ${focus}`);
    const focusTerms = words(focus);
    const ranked = candidates.map(source => {
      const text = `${source.title} ${source.text}`.toLowerCase();
      const score = queryTerms.filter(term => text.includes(term)).length + 3 * focusTerms.filter(term => text.includes(term)).length;
      return { source, score: score + (['overview', 'scope'].includes(source.kind) ? 1000 : 0) };
    }).sort((a, b) => b.score - a.score || b.source.date.localeCompare(a.source.date));
    const sources = ranked.slice(0, PAST_DATA_LIMITS.sources).map(row => row.source);
    await this.target(user, projectId, deliverableId, true);
    return { assignment, sources, diagnostics: {
      candidatesConsidered: candidates.length, sourcesSent: sources.length, queryTerms,
      limitsReached: callNotes.length > PAST_DATA_LIMITS.notes || workstreams.length > PAST_DATA_LIMITS.workstreams || deliverables.length > PAST_DATA_LIMITS.deliverables || candidates.length > sources.length || sources.some(source => source.truncated),
      linkedFilesRead: false, earlierReleasedWorkstreamsOnly: true,
    } };
  }

  async readSource(user: CmsReader, projectId: string, deliverableId: string, kind: PastSourceKind, recordId: string) {
    const { actor, target } = await this.target(user, projectId, deliverableId);
    const access = await this.reads.deliverableScope(actor, projectId);
    const previous: Prisma.DeliverableWhereInput = { AND: [access.where, { sprint: { is: { projectId, status: 'RELEASED', weekStartDate: { lt: target.sprint.weekStartDate } } } }] };
    let source: PastSource;
    this.flags.assertAgenticCmsEnabledFor(actor.email);
    if (kind === 'overview' || kind === 'scope') {
      if (recordId !== projectId) this.deny();
      const row = await this.prisma.project.findUnique({ where: { id: projectId }, select: { overview: true, scope: true, updatedAt: true } });
      if (!row) this.deny();
      source = this.source(projectId, deliverableId, kind, recordId, kind === 'overview' ? 'Project overview' : 'Project scope / SOW', row[kind] ?? '', row.updatedAt);
    } else if (kind === 'note') {
      const row = await this.prisma.projectContextNote.findFirst({ where: { id: recordId, projectId, createdAt: { lte: new Date() } } });
      if (!row) this.deny();
      source = this.source(projectId, deliverableId, kind, recordId, row.title, row.content, row.createdAt);
    } else if (kind === 'workstream') {
      const scope = await this.reads.workstreamScope(actor, projectId);
      const row = await this.prisma.sprint.findFirst({ where: { AND: [scope.where, { id: recordId, status: 'RELEASED', weekStartDate: { lt: target.sprint.weekStartDate } }] } });
      if (!row) this.deny();
      source = this.source(projectId, deliverableId, kind, recordId, row.label, notes(row.configSnapshot), row.updatedAt);
    } else if (kind === 'feedback') {
      const row = await this.prisma.submission.findFirst({ where: { id: recordId, deliverable: { is: previous } }, include: { deliverable: { select: { title: true } } } });
      if (!row) this.deny();
      source = this.source(projectId, deliverableId, kind, recordId, `${row.deliverable.title} — recorded feedback`, row.feedback ?? '', row.reviewedAt ?? row.submittedAt);
    } else {
      const row = await this.prisma.deliverable.findFirst({ where: { AND: [previous, { id: recordId }] }, include: { researchWorkspace: true } });
      if (!row || (kind === 'research' && !row.researchWorkspace)) this.deny();
      source = this.source(projectId, deliverableId, kind, recordId, `${row.title} — ${kind === 'research' ? 'saved research' : 'assignment brief'}`,
        kind === 'research' ? this.researchText(row.researchWorkspace.document) : row.description ?? '', kind === 'research' ? row.researchWorkspace.updatedAt : row.updatedAt);
    }
    await this.target(user, projectId, deliverableId);
    return source;
  }

  private deny(): never { throw new NotFoundException({ code: 'NOT_FOUND_OR_FORBIDDEN', message: 'This research source is unavailable.' }); }
}
