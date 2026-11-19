import { PptxReviewTools } from './pptx-review.tools';
import type { ToolContext } from './tool.types';

const source = { deliverableId: 'deliverable', submissionId: 'submission' };
const etag = '"reviewed,1"';
const deck = (over: Record<string, unknown> = {}) => ({
  id: 'submission', fileUrl: 'https://tenant.sharepoint.com/submitted', fileName: 'Deck v1.pptx', version: 1,
  submittedAt: new Date('2026-11-10T10:00:00.000Z'), deliverable: { title: 'Kickoff deck' }, ...over,
});

describe('PowerPoint submission authorization and snapshot binding', () => {
  let tools: PptxReviewTools;
  let graph: { resolveLink: jest.Mock; downloadPptx: jest.Mock; uploadPptx: jest.Mock; isConfigured: jest.Mock };
  let access: { assertDeliverableAccess: jest.Mock; assertContextWrite: jest.Mock };
  let prisma: { submission: { findFirst: jest.Mock } };
  let writer: { writeComments: jest.Mock };
  let flags: { assertAgenticCmsEnabledFor: jest.Mock };
  let controller: AbortController;
  let ctx: ToolContext;
  beforeEach(() => {
    graph = { resolveLink: jest.fn().mockResolvedValue({ itemId: 'item', driveId: 'drive', eTag: etag }),
      downloadPptx: jest.fn().mockResolvedValue(Buffer.from('reviewed content')),
      uploadPptx: jest.fn().mockResolvedValue({ status: 200, newEtag: '"next,2"' }), isConfigured: jest.fn().mockReturnValue(true) };
    access = { assertDeliverableAccess: jest.fn().mockResolvedValue({}), assertContextWrite: jest.fn().mockResolvedValue({}) };
    prisma = { submission: { findFirst: jest.fn().mockResolvedValue(deck())  } };
    writer = { writeComments: jest.fn().mockResolvedValue({ buffer: Buffer.from('modified'), legacy: false, commentCount: 1 }) };
    flags = { assertAgenticCmsEnabledFor: jest.fn() };
    controller = new AbortController();
    ctx = { user: { id: 'reviewer', email: 'reviewer@example.test', role: 'LC' }, projectId: 'selected-project', conversationId: 'conv1', signal: controller.signal, addSources: jest.fn() };
    tools = new PptxReviewTools(graph as never, { extractDeck: jest.fn().mockResolvedValue({ slideCount: 1,
      slides: [{ index: 1, sldId: '256', shapes: [], speakerNotes: '' }] }) } as never,
    writer as never, { isVisionEnabled: () => false } as never, flags as never, prisma as never, access as never);
  });
  const fetchDeck = () => tools.tools.find((tool) => tool.name === 'fetch_pptx_content')!.run(source, ctx);
  const post = (override = {}, context = ctx) => tools.tools.find((tool) => tool.name === 'add_pptx_comments')!.run({
    ...source, etag, findings: [{ slideIndex: 1, severity: 'MINOR', comment: 'Cite the figure' }], ...override,
  }, context);

  it('loads only the authorized CMS submission and rejects arbitrary URL arguments', async () => {
    const tool = tools.tools.find((item) => item.name === 'fetch_pptx_content')!;
    expect(tool.input.safeParse({ url: 'https://attacker.test/a.pptx' }).success).toBe(false);
    await fetchDeck();
    expect(access.assertDeliverableAccess).toHaveBeenCalledWith(ctx.user, 'selected-project', 'deliverable');
    expect(prisma.submission.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'submission', deliverableId: 'deliverable' } }));
    expect(graph.resolveLink).toHaveBeenCalledWith('https://tenant.sharepoint.com/submitted', ctx.signal);
  });

  it('denies unauthorized records before opening remote files', async () => {
    access.assertDeliverableAccess.mockRejectedValue(new Error('unavailable'));
    await expect(fetchDeck()).rejects.toThrow('unavailable');
    expect(graph.resolveLink).not.toHaveBeenCalled();
  });

  it('requires reviewer authorization even after a permitted read', async () => {
    await fetchDeck();
    access.assertContextWrite.mockRejectedValue(new Error('reviewer required'));
    await expect(post()).rejects.toThrow('reviewer required');
    expect(graph.uploadPptx).not.toHaveBeenCalled();
  });

  it('rejects a fabricated wildcard snapshot and snapshots from another user', async () => {
    await fetchDeck();
    expect((await post({ etag: '*' })).content).toContain('stale');
    expect((await post({}, { ...ctx, user: { ...ctx.user, id: 'other-reviewer' } })).content).toContain('stale');
    expect(graph.uploadPptx).not.toHaveBeenCalled();
  });

  it('detects changed bytes even when metadata incorrectly retains the same eTag', async () => {
    await fetchDeck();
    graph.downloadPptx.mockResolvedValue(Buffer.from('edited content'));
    expect((await post()).content).toContain('stale');
    expect(writer.writeComments).not.toHaveBeenCalled();
    expect(graph.uploadPptx).not.toHaveBeenCalled();
  });

  it('rechecks permissions immediately before uploading', async () => {
    await fetchDeck();
    await post();
    expect(access.assertContextWrite).toHaveBeenCalledTimes(2);
    expect(graph.uploadPptx).toHaveBeenCalledWith(expect.objectContaining({ eTag: etag }), Buffer.from('modified'), etag, ctx.signal);
  });

  it('does not upload when the request aborts during comment generation', async () => {
    await fetchDeck();
    writer.writeComments.mockImplementation(() => { controller.abort(); return { buffer: Buffer.from('modified'), legacy: false, commentCount: 1 }; });
    await expect(post()).rejects.toThrow();
    expect(graph.uploadPptx).not.toHaveBeenCalled();
  });

  it('does no remote work when the feature is disabled', async () => {
    flags.assertAgenticCmsEnabledFor.mockImplementation(() => { throw new Error('disabled'); });
    await expect(fetchDeck()).rejects.toThrow('disabled');
    expect(graph.resolveLink).not.toHaveBeenCalled();
  });
  describe('approval', () => {
    const tool = () => tools.tools.find((item) => item.name === 'add_pptx_comments')!;

    it('asks for approval and previews the findings instead of posting', () => {
      expect(tool().requiresApproval).toBe(true);
      const preview = tool().describeForApproval!({ ...source, etag, findings: [
        { slideIndex: 3, severity: 'BLOCKING', comment: 'No source line.' },
        { slideIndex: 4, severity: 'MINOR', comment: 'Axis unit.' },
      ] });
      expect(preview.summary).toBe('Post 2 comments to the PowerPoint');
      expect(preview.items).toEqual([{ where: 'Slide 3', text: '[BLOCKING] No source line.' }, { where: 'Slide 4', text: '[MINOR] Axis unit.' }]);
    });

    const proposal = { ...source, etag, findings: [{ slideIndex: 1, severity: 'MINOR', comment: 'Cite the figure' }] };

    it('refuses before asking when the user is not a reviewer, with no remote work', async () => {
      access.assertContextWrite.mockRejectedValue(new Error('reviewer required'));
      await expect(tool().prepareApproval!(proposal, ctx)).rejects.toThrow('reviewer required');
      expect(graph.resolveLink).not.toHaveBeenCalled();
      expect(graph.uploadPptx).not.toHaveBeenCalled();
    });

    it('fails before asking when the deck was not read in this session', async () => {
      await expect(tool().prepareApproval!(proposal, ctx)).rejects.toMatchObject({ note: 'Read deck again' });
    });

    it('fails before asking when the eTag is not the one that was read', async () => {
      await fetchDeck();
      await expect(tool().prepareApproval!({ ...proposal, etag: '"other,9"' }, ctx)).rejects.toMatchObject({ note: 'Read deck again' });
    });

    it('names the CMS deliverable, file, version, date and snapshot, without remote work after the read', async () => {
      await fetchDeck();
      graph.resolveLink.mockClear();
      const out = await tool().prepareApproval!(proposal, ctx);
      expect(out).toMatchObject({ deliverable: 'Kickoff deck', file: 'Deck v1.pptx', version: 1, submittedAt: '2026-11-10T10:00:00.000Z' });
      expect(out.snapshot).toMatch(/^[0-9a-f]{12}$/);
      expect(graph.resolveLink).not.toHaveBeenCalled();
    });

    it('tells two submissions with the same slide label apart, and notices a replaced link', async () => {
      await fetchDeck();
      const v1 = await tool().prepareApproval!(proposal, ctx);

      const second = { deliverableId: 'deliverable', submissionId: 'submission2' };
      prisma.submission.findFirst.mockResolvedValue(deck({ id: 'submission2', fileName: 'Deck v2.pptx', version: 2, fileUrl: 'https://tenant.sharepoint.com/v2' }));
      graph.downloadPptx.mockResolvedValue(Buffer.from('second deck content'));
      await tools.tools.find((item) => item.name === 'fetch_pptx_content')!.run(second, ctx);
      const v2 = await tool().prepareApproval!({ ...proposal, ...second }, ctx);

      expect([v1.file, v2.file]).toEqual(['Deck v1.pptx', 'Deck v2.pptx']);
      expect([v1.version, v2.version]).toEqual([1, 2]);
      expect(v1.snapshot).not.toBe(v2.snapshot);
      expect(v1.binding).not.toBe(v2.binding);

      prisma.submission.findFirst.mockResolvedValue(deck({ fileUrl: 'https://tenant.sharepoint.com/replaced' }));
      await expect(tool().prepareApproval!(proposal, ctx)).rejects.toMatchObject({ note: 'Read deck again' }); // link no longer matches the read snapshot
    });
  });
});
