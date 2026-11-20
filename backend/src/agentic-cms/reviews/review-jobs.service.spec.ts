/* eslint-disable @typescript-eslint/no-explicit-any -- Nest test doubles */
import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, type CmsReader } from '../authorization/cms-read-access.service';
import { GoogleDocReviewService } from '../documents/google-doc-review.service';
import { MODEL_CLIENT, type ChatMessage, type ModelRequest } from '../model/model-client';
import { CmsReadService } from '../reads/cms-read.service';
import { SkillLibrary } from '../skills/skill-library';
import { PptxReviewTools } from '../tools/pptx-review.tools';
import { ReviewJobsService, type Review } from './review-jobs.service';

const ROLES = { ADMIN: 'ADMIN', LC: 'LC', PM: 'PM', CONSULTANT: 'CONSULTANT' } as const;

const user = (role: string = ROLES.PM): CmsReader => ({
  id: 'pm-1',
  email: 'pm@illinois.edu',
  role: role as CmsReader['role'],
});

const row = {
  id: 'sub-1',
  deliverableId: 'del-1',
  fileUrl: 'https://docs.google.com/document/d/abc/edit',
  fileName: 'White paper.docx',
  version: 3,
  submittedAt: new Date('2024-05-01T00:00:00Z'),
  submitter: { firstName: 'A', lastName: 'Consultant', email: 'c@illinois.edu' },
  deliverable: { projectId: 'p1', title: 'Final White Paper', sprintId: 'sp-1', sprint: { label: 'Week 3' } },
};

const slidesRow = {
  id: 'sub-2',
  deliverableId: 'del-2',
  fileUrl: 'https://contoso.sharepoint.com/:p:/deck.pptx',
  fileName: 'Final deck.pptx',
  version: 1,
  submittedAt: new Date('2024-05-02T00:00:00Z'),
  submitter: { firstName: 'B', lastName: 'Consultant', email: 'c@illinois.edu' },
  deliverable: { projectId: 'p1', title: 'Final Client Deck', sprintId: 'sp-1', sprint: { label: 'Week 3' } },
};

const docReviewJson = JSON.stringify({
  overview: 'Two issues found',
  skipped: [],
  notCheckable: [],
  findings: [
    { severity: 'MATERIAL', section: 'Intro', quote: 'exact quote one', issue: 'issue 1', significance: 'sig 1', fix: 'fix 1' },
    { severity: 'MINOR', quote: 'exact quote two', issue: 'issue 2', significance: 'sig 2', fix: 'fix 2' },
    { severity: 'BLOCKING', section: 'Intro', issue: 'no quote', significance: 'sig 3', fix: 'fix 3' },
  ],
});

const slidesReviewJson = JSON.stringify({
  overview: 'Deck review',
  skipped: ['Slide 11'],
  notCheckable: [],
  findings: [
    { severity: 'BLOCKING', slide: 2, issue: 'issue', significance: 'sig', fix: 'fix' },
  ],
});

function buildModelClient(script: string[]) {
  const stream = jest.fn(async (_req: ModelRequest) => {
    const next = script.shift();
    if (next === undefined) throw new Error('model script exhausted');
    return { text: next, toolCalls: [], message: { role: 'assistant', content: next } as ChatMessage };
  });
  return { name: 'fake', stream };
}

describe('ReviewJobsService', () => {
  let service: ReviewJobsService;
  let prisma: any;
  let access: any;
  let skills: any;
  let docs: any;
  let pptx: any;
  let reads: any;
  let model: ReturnType<typeof buildModelClient>;

  async function setup(options: {
    rows?: any[];
    modelScript?: string[];
    docComment?: jest.Mock;
    docRead?: jest.Mock;
    slideTools?: any[];
    configured?: boolean;
    accessThrows?: Error;
    workstreamThrows?: boolean;
  } = {}) {
    prisma = {
      submission: { findMany: jest.fn().mockResolvedValue(options.rows ?? [row]) },
    };
    access = {
      assertContextWrite: jest.fn(async () => {
        if (options.accessThrows) throw options.accessThrows;
      }),
      assertDeliverableAccess: jest.fn(async () => undefined),
    };
    skills = {
      load: jest.fn(async (name: string) => ({
        name,
        description: name,
        instructions: `instructions for ${name}`,
        shared: [],
        contracts: [],
        missing: [],
      })),
    };
    docs = {
      read: options.docRead ?? jest.fn(async () => ({
        schemaVersion: '1',
        document: {
          submissionId: 'sub-1',
          url: row.fileUrl,
          documentId: 'abc',
          title: 'T',
          revisionId: 'rev-1',
          textHash: 'sha256:hash',
          capturedAt: new Date().toISOString(),
        },
        paragraphs: [
          { n: 1, section: 'Intro', text: 'exact quote one' },
          { n: 2, section: null, text: 'exact quote two' },
        ],
        truncated: false,
        footnotes: [],
        tableOfContents: null,
        coverage: { footnotes: 'none-in-document', tableOfContents: 'none-in-document', objectsNotRead: 0, links: 'all' },
      })),
      comment: options.docComment ?? jest.fn(async (_user, input) => ({
        schemaVersion: '1',
        document: {
          submissionId: 'sub-1',
          url: row.fileUrl,
          documentId: 'abc',
          title: 'T',
          revisionId: 'rev-1',
          textHash: input.textHash,
          capturedAt: new Date().toISOString(),
        },
        revisionGuarded: true,
        comments: input.comments.map((entry: any, i: number) => ({
          quote: entry.quote,
          comment: entry.comment,
          section: 'Intro',
          placement: i === 0 ? 'native' : 'fallback',
          nativeCommentId: i === 0 ? 'native-1' : null,
          fallbackReason: i === 0 ? null : 'not-found',
          anchoredText: i === 0 ? entry.quote : null,
          anchorVerified: i === 0 ? true : null,
        })),
      })),
    };
    const slideTools = [
      {
        name: 'fetch_pptx_content',
        run: jest.fn(async () => ({
          content: JSON.stringify({
            submissionId: 'sub-2',
            eTag: 'etag-1',
            textHash: 'sha256:deck',
            capturedAt: new Date().toISOString(),
            slides: 5,
            truncated: false,
            content: 'Slide 1: hi',
          }),
        })),
      },
      {
        name: 'get_pptx_slide_images',
        run: jest.fn(async () => ({
          content: 'Rendered slides in image order: 1, 2',
          images: [
            { base64: 'AAA', mimeType: 'image/png' },
            { base64: 'BBB', mimeType: 'image/png' },
          ],
        })),
      },
      {
        name: 'add_pptx_comments',
        run: jest.fn(async () => ({
          content: JSON.stringify({ outcome: 'comments_live', commentsPosted: 1 }),
        })),
      },
    ];
    pptx = {
      isConfigured: jest.fn(() => options.configured !== false),
      tools: options.slideTools ?? slideTools,
    };
    reads = {
      getProjectContext: jest.fn(async () => ({ project: { name: 'test' }, notes: { items: [] } })),
      getDeliverable: jest.fn(async () => ({ deliverable: { title: 'Final White Paper' }, submissions: { items: [] } })),
      getWorkstream: jest.fn(async () => {
        if (options.workstreamThrows) throw new Error('workstream unavailable');
        return { workstream: { label: 'Week 3' }, deliverables: { items: [] } };
      }),
    };
    model = buildModelClient(options.modelScript ?? [docReviewJson]);
    const mod = await Test.createTestingModule({
      providers: [
        ReviewJobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CmsReadAccessService, useValue: access },
        { provide: SkillLibrary, useValue: skills },
        { provide: GoogleDocReviewService, useValue: docs },
        { provide: PptxReviewTools, useValue: pptx },
        { provide: CmsReadService, useValue: reads },
        { provide: MODEL_CLIENT, useValue: model },
      ],
    }).compile();
    service = mod.get(ReviewJobsService);
  }

  async function storedReview(projectId: string, id: string): Promise<Review> {
    return (await service.list(user(), projectId)).reviews.find((r) => r.id === id)! as Review;
  }

  describe('skill choice', () => {
    it.each([
      ['document', 'BASIC', 'whitepaper-review-basic'],
      ['document', 'ADVANCED', 'whitepaper-review-advanced'],
      ['slides', 'BASIC', 'presentation-review-basic'],
      ['slides', 'ADVANCED', 'presentation-review-advanced'],
    ])('runs %s %s with %s', async (format, level, expected) => {
      const rowFor = format === 'document' ? row : slidesRow;
      const script = format === 'document' ? [docReviewJson] : [slidesReviewJson];
      await setup({ rows: [rowFor], modelScript: script });
      const created = await service.request(user(), 'p1', {
        submissionId: rowFor.id,
        level: level as 'BASIC' | 'ADVANCED',
      });
      await service.whenIdle();
      expect(skills.load).toHaveBeenCalledWith(expected);
      const stored = await storedReview('p1', created.id);
      expect(stored.status).toBe('COMPLETED');
    });
  });

  it('document job posts comments and maps placement', async () => {
    await setup();
    const created = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'BASIC' });
    await service.whenIdle();
    expect(docs.comment).toHaveBeenCalledTimes(1);
    const arg = docs.comment.mock.calls[0][1];
    expect(arg.comments).toHaveLength(2);
    expect(arg.comments[0].comment).toMatch(/^\[MATERIAL\] issue 1/);

    const stored = await storedReview('p1', created.id);
    expect(stored.status).toBe('COMPLETED');
    expect(stored.comments).toHaveLength(3);
    expect(stored.comments[0].placement).toBe('native');
    expect(stored.comments[0].location).toEqual({ type: 'section', section: 'Intro' });
    expect(stored.comments[0].anchorVerified).toBe(true);
    expect(stored.comments[1].placement).toBe('fallback');
    expect(stored.comments[1].fallbackReason).toBe('not-found');
    expect(stored.comments[2].placement).toBeUndefined();
    expect(stored.summary?.counts).toEqual({ BLOCKING: 1, MATERIAL: 1, MINOR: 1 });
  });

  it('marks every postable finding fallback comment-failed when docs.comment throws', async () => {
    const docComment = jest.fn(async () => {
      throw new Error('boom');
    });
    await setup({ docComment });
    const created = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'BASIC' });
    await service.whenIdle();
    const stored = await storedReview('p1', created.id);
    expect(stored.status).toBe('COMPLETED');
    expect(stored.comments[0].placement).toBe('fallback');
    expect(stored.comments[0].fallbackReason).toBe('comment-failed');
    expect(stored.comments[1].placement).toBe('fallback');
    expect(stored.comments[1].fallbackReason).toBe('comment-failed');
    expect(stored.comments[2].placement).toBeUndefined();
  });

  it('slides BASIC sends images and sets inspection visual', async () => {
    await setup({ rows: [slidesRow], modelScript: [slidesReviewJson] });
    const created = await service.request(user(), 'p1', { submissionId: 'sub-2', level: 'BASIC' });
    await service.whenIdle();

    const fetchTool = pptx.tools.find((t: any) => t.name === 'fetch_pptx_content');
    const imageTool = pptx.tools.find((t: any) => t.name === 'get_pptx_slide_images');
    expect(fetchTool.run).toHaveBeenCalledTimes(1);
    expect(imageTool.run).toHaveBeenCalledTimes(1);

    const req = model.stream.mock.calls[0][0] as ModelRequest;
    const userContent = req.messages.find((m) => m.role === 'user')!.content;
    expect(Array.isArray(userContent)).toBe(true);
    const imageParts = (userContent as any[]).filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(2);
    expect(imageParts[0].image_url.url).toBe('data:image/png;base64,AAA');

    const stored = await storedReview('p1', created.id);
    expect(stored.powerPoint?.inspection).toBe('visual');
    expect(stored.powerPoint?.outcome).toBe('comments_live');
    expect(stored.comments[0].placement).toBe('native');
  });

  it('retries the model once on bad JSON and succeeds', async () => {
    await setup({ modelScript: ['not json at all', docReviewJson] });
    const created = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'BASIC' });
    await service.whenIdle();
    expect(model.stream).toHaveBeenCalledTimes(2);
    const stored = await storedReview('p1', created.id);
    expect(stored.status).toBe('COMPLETED');
  });

  it('returns 409 when a duplicate request is in flight', async () => {
    await setup();
    let resolveFirst: (value: any) => void = () => undefined;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    (model.stream as jest.Mock).mockImplementationOnce(async () => first);
    await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'BASIC' });
    await expect(service.request(user(), 'p1', { submissionId: 'sub-1', level: 'BASIC' }))
      .rejects.toBeInstanceOf(ConflictException);
    resolveFirst({ text: docReviewJson, toolCalls: [], message: { role: 'assistant', content: docReviewJson } });
    await service.whenIdle();
  });

  it('fails with 403 on list and request when assertContextWrite throws', async () => {
    await setup({ accessThrows: new ForbiddenException('nope') });
    const { ReviewsController } = await import('./reviews.controller');
    const projects: any = { assertProjectAccess: jest.fn(async () => ({ id: 'p1', pmId: 'pm-1' })) };
    const controller = new ReviewsController(service, projects, access);
    await expect(controller.list('p1', user(ROLES.CONSULTANT))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.request('p1', { submissionId: 'sub-1', level: 'BASIC' }, user(ROLES.CONSULTANT)))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reruns assertContextWrite at job start and fails file_access if revoked while queued', async () => {
    await setup();
    access.assertContextWrite
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new ForbiddenException('revoked');
      });

    const ok = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'BASIC' });
    await service.whenIdle();
    expect((await storedReview('p1', ok.id)).status).toBe('COMPLETED');

    const created = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'ADVANCED', focusNote: 'focus' });
    await service.whenIdle();
    const stored = await storedReview('p1', created.id);
    expect(stored.status).toBe('FAILED');
    expect(stored.failure).toEqual({ kind: 'file_access' });
  });

  it('advanced context includes project, deliverable and workstream', async () => {
    await setup({ modelScript: [docReviewJson] });
    const created = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'ADVANCED' });
    await service.whenIdle();
    expect(reads.getProjectContext).toHaveBeenCalled();
    expect(reads.getDeliverable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: 'p1', deliverableId: 'del-1' }),
    );
    expect(reads.getWorkstream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: 'p1', workstreamId: 'sp-1' }),
    );
    const stored = await storedReview('p1', created.id);
    expect(stored.status).toBe('COMPLETED');
    expect(stored.summary?.notCheckable).toEqual([]);
  });

  it('keeps notCheckable markers from advanced-context failures', async () => {
    await setup({ modelScript: [docReviewJson], workstreamThrows: true });
    const created = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'ADVANCED' });
    await service.whenIdle();
    const stored = await storedReview('p1', created.id);
    expect(stored.status).toBe('COMPLETED');
    expect(stored.summary?.notCheckable).toContain('Workstream');
  });

  it('strips sprintId from HTTP-facing submissions', async () => {
    await setup();
    const queue = await service.list(user(), 'p1');
    expect(queue.submissions[0]).not.toHaveProperty('sprintId');
  });

  it('maps Google Doc read failure (ForbiddenException) to file_access', async () => {
    const docRead = jest.fn(async () => { throw new ForbiddenException('no access'); });
    await setup({ docRead });
    const created = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'BASIC' });
    await service.whenIdle();
    const stored = await storedReview('p1', created.id);
    expect(stored.status).toBe('FAILED');
    expect(stored.failure).toEqual({ kind: 'file_access' });
  });

  it('maps Google Doc not-found to file_access', async () => {
    const docRead = jest.fn(async () => { throw new NotFoundException('missing'); });
    await setup({ docRead });
    const created = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'BASIC' });
    await service.whenIdle();
    const stored = await storedReview('p1', created.id);
    expect(stored.failure?.kind).toBe('file_access');
  });

  it('marks slides reviews config failure when PptxReviewTools is not configured', async () => {
    await setup({ rows: [slidesRow], configured: false });
    const created = await service.request(user(), 'p1', { submissionId: 'sub-2', level: 'BASIC' });
    await service.whenIdle();
    const stored = await storedReview('p1', created.id);
    expect(stored.status).toBe('FAILED');
    expect(stored.failure?.kind).toBe('config');
  });

  it('maps a CONFIG ServiceUnavailableException to config', async () => {
    const docRead = jest.fn(async () => {
      throw new ServiceUnavailableException({ code: 'CONFIG', message: 'nope' });
    });
    await setup({ docRead });
    const created = await service.request(user(), 'p1', { submissionId: 'sub-1', level: 'BASIC' });
    await service.whenIdle();
    const stored = await storedReview('p1', created.id);
    expect(stored.failure?.kind).toBe('config');
  });
});
