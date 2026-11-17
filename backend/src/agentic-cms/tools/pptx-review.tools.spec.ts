import { PptxReviewTools } from './pptx-review.tools';
import type { ToolContext } from './tool.types';

const source = { deliverableId: 'deliverable', submissionId: 'submission' };
const etag = '"reviewed,1"';

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
    prisma = { submission: { findFirst: jest.fn().mockResolvedValue({ fileUrl: 'https://tenant.sharepoint.com/submitted' }) } };
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
    expect(prisma.submission.findFirst).toHaveBeenCalledWith({ where: { id: 'submission', deliverableId: 'deliverable' }, select: { fileUrl: true } });
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

    it('refuses before asking when the user is not a reviewer, with no remote work', async () => {
      access.assertContextWrite.mockRejectedValue(new Error('reviewer required'));
      await expect(tool().checkBeforeApproval!({ ...source }, ctx)).rejects.toThrow('reviewer required');
      expect(graph.resolveLink).not.toHaveBeenCalled();
      expect(graph.uploadPptx).not.toHaveBeenCalled();
    });
  });
});
