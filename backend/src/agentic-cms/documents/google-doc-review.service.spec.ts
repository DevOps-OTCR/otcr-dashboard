import { Logger, NotFoundException } from '@nestjs/common';
import type { CmsReader } from '../authorization/cms-read-access.service';
import { GoogleDocReviewService } from './google-doc-review.service';
import { flattenDocument, textHash } from './google-doc';
import { GoogleDocsError } from './google-docs.client';

// The comment loop lives only in GoogleDocReviewService; MCP and OTCR Bot both call it.
// Everything here is faked: no network, no database.

const BOT = 'bot@proj.iam.gserviceaccount.com';
const FILE_URL = 'https://docs.google.com/document/d/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit';
const user = { id: 'u1', email: 'pm@x.test', role: 'PM' } as unknown as CmsReader;
const target = { projectId: 'p1', deliverableId: 'd1', submissionId: 'sub1' };

const para = (start: number, text: string) => ({
  startIndex: start,
  endIndex: start + text.length,
  paragraph: { elements: [{ startIndex: start, endIndex: start + text.length, textRun: { content: text } }] },
});
/** Lays paragraphs out one after another from index 1, as Google does. */
function docOf(lines: string[], revisionId: string | null = 'r1') {
  let at = 1;
  const content = lines.map((line) => {
    const element = para(at, `${line}\n`);
    at = element.endIndex;
    return element;
  });
  return { title: 'Paper', ...(revisionId ? { revisionId } : {}), body: { content } };
}
const standard = docOf(['alpha one here', 'beta two here', 'gamma three here']);

const posted = (id: string) => ({ commentId: id, anchoredText: null, nextRevisionId: null, raw: {} });
type Insert = (documentId: string, comment: Record<string, unknown>, revisionId: string | null) => Promise<unknown>;
const insertMock = (impl: Insert = async () => posted('k')) => jest.fn(impl);

function setup(over: { getDocument?: jest.Mock; insertComment?: jest.Mock; flags?: jest.Mock; configured?: boolean; submission?: unknown } = {}) {
  const prisma = { submission: { findFirst: jest.fn(async () => (over.submission === undefined ? { id: 'sub1', fileUrl: FILE_URL } : over.submission)) } };
  const access = { assertDeliverableAccess: jest.fn(async () => undefined), assertContextWrite: jest.fn(async () => undefined) };
  const flags = { assertAgenticCmsEnabledFor: over.flags ?? jest.fn() };
  const client = {
    isConfigured: jest.fn(() => over.configured ?? true),
    serviceAccountEmail: () => BOT,
    getDocument: over.getDocument ?? jest.fn(async () => standard),
    insertComment: over.insertComment ?? insertMock(),
  };
  const service = new GoogleDocReviewService(prisma as never, access as never, flags as never, client as never);
  return { service, prisma, access, flags, client };
}
const comments = (...quotes: string[]) => ({ ...target, textHash: textHash(flattenDocument(standard)), comments: quotes.map((quote) => ({ quote, comment: `about ${quote}` })) });
const reasons = (out: { comments: readonly unknown[] }) => out.comments.map((x) => (x as { fallbackReason: string | null }).fallbackReason);
const placements = (out: { comments: readonly unknown[] }) => out.comments.map((x) => (x as { placement: string }).placement);
const failure = (promise: Promise<unknown>) => promise.then(() => { throw new Error('expected a failure'); }, (error) => error);

describe('GoogleDocReviewService.read: what was left out', () => {
  const footnoted = (count: number, size: number, withContents = true) => {
    const refs = Array.from({ length: count }, (_, i) => ({ startIndex: 20 + i, endIndex: 21 + i, footnoteReference: { footnoteId: `fn${i}`, footnoteNumber: String(i + 1) } }));
    const end = 20 + count;
    return {
      title: 'Paper', revisionId: 'r1',
      body: { content: [
        ...(withContents ? [{ startIndex: 1, endIndex: 10, tableOfContents: { content: [para(1, 'Findings\n')] } }] : []),
        { startIndex: 10, endIndex: end + 1, paragraph: { elements: [{ startIndex: 10, endIndex: 20, textRun: { content: 'Cited text' } }, ...refs, { startIndex: end, endIndex: end + 1, textRun: { content: '\n' } }] } },
      ] },
      footnotes: Object.fromEntries(refs.map((_, i) => [`fn${i}`, { content: [para(0, `${'s'.repeat(size)}\n`)] }])),
    };
  };
  // A footnote cannot sit in `body` in a real response; the reader accepts the tabless shape too.
  const read = (doc: object) => setup({ getDocument: jest.fn(async () => doc) }).service.read(user, target);

  it('returns footnotes, the contents table and full coverage when everything fits', async () => {
    const out = await read(footnoted(2, 50));
    expect(out.footnotes).toHaveLength(2);
    expect(out.tableOfContents).toEqual(['Findings']);
    expect(out.paragraphs[0].footnotes).toEqual(['1', '2']);
    expect(out.coverage).toEqual({ footnotes: 'all', tableOfContents: 'included', objectsNotRead: 0, links: 'all' });
  });

  it('says there is nothing to report when the document has no footnotes or contents', async () => {
    const out = await read(footnoted(0, 0, false));
    expect(out.footnotes).toEqual([]);
    expect(out.tableOfContents).toBeNull();
    expect(out.coverage).toEqual({ footnotes: 'none-in-document', tableOfContents: 'none-in-document', objectsNotRead: 0, links: 'all' });
  });

  it('keeps whole footnotes up to 4,000 characters and marks the rest as not covered', async () => {
    const out = await read(footnoted(50, 200));
    expect(out.footnotes).toHaveLength(20);
    expect(out.footnotes.every((note) => note.text.length === 200)).toBe(true);
    expect(out.coverage.footnotes).toBe('some');
  });

  it('puts footnote text in the hash the comment call checks', async () => {
    const a = await read(footnoted(1, 50));
    const b = await read(footnoted(1, 51));
    expect(a.document.textHash).not.toBe(b.document.textHash);
  });
});

describe('GoogleDocReviewService.approvalTarget', () => {
  const file = (over: Record<string, unknown>) => ({
    id: 'sub1', fileUrl: FILE_URL, fileName: 'Paper v1', version: 1, submittedAt: new Date('2026-11-10T10:00:00.000Z'), deliverable: { title: 'Final paper' }, ...over,
  });
  const input = { ...comments('alpha one') };

  it('names the CMS deliverable, file, version, date and snapshot, and scopes the lookup to the deliverable', async () => {
    const { service, prisma } = setup({ submission: file({}) });
    const out = await service.approvalTarget(user, input);
    expect(out).toMatchObject({ deliverable: 'Final paper', file: 'Paper v1', version: 1, submittedAt: '2026-11-10T10:00:00.000Z' });
    expect(out.snapshot).toBe(input.textHash.replace('sha256:', '').slice(0, 12));
    expect(prisma.submission.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sub1', deliverableId: 'd1' } }));
  });

  it('gives two submissions with the same passage and feedback different targets and bindings', async () => {
    const v1 = await setup({ submission: file({}) }).service.approvalTarget(user, input);
    const v2 = await setup({ submission: file({ id: 'sub2', fileName: 'Paper v2', version: 2, fileUrl: `${FILE_URL}2` }) })
      .service.approvalTarget(user, { ...input, submissionId: 'sub2', textHash: 'sha256:' + 'b'.repeat(64) });
    expect([v1.file, v2.file]).toEqual(['Paper v1', 'Paper v2']);
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect(v1.snapshot).not.toBe(v2.snapshot);
    expect(v1.binding).not.toBe(v2.binding);
  });

  it('changes the binding when the submission link is replaced', async () => {
    const before = await setup({ submission: file({}) }).service.approvalTarget(user, input);
    const after = await setup({ submission: file({ fileUrl: `${FILE_URL}2` }) }).service.approvalTarget(user, input);
    expect(after.binding).not.toBe(before.binding);
  });

  it('refuses a user who may not post', async () => {
    const { service, access } = setup({ submission: file({}) });
    access.assertContextWrite.mockRejectedValue(new NotFoundException({ code: 'NOT_FOUND_OR_FORBIDDEN', message: 'x' }));
    await expect(service.approvalTarget(user, input)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('GoogleDocReviewService.comment', () => {
  it('carries each new revision into the next write', async () => {
    let call = 0;
    const insertComment = insertMock(async () => ({ ...posted(`k${++call}`), nextRevisionId: `r${call + 1}` }));
    const { service } = setup({ insertComment });
    const out = await service.comment(user, comments('alpha one', 'beta two', 'gamma three'));
    expect(insertComment.mock.calls.map((args) => args[2])).toEqual(['r1', 'r2', 'r3']);
    expect(out.revisionGuarded).toBe(true);
    expect(out.document.revisionId).toBe('r4');
  });

  it('writes unguarded and says so when Google gave no revisionId', async () => {
    const insertComment = insertMock(async () => posted('k'));
    const doc = docOf(['alpha one here', 'beta two here'], null);
    const { service } = setup({ insertComment, getDocument: jest.fn(async () => doc) });
    const out = await service.comment(user, { ...comments('alpha one', 'beta two'), textHash: textHash(flattenDocument(doc)) });
    expect(insertComment.mock.calls.map((args) => args[2])).toEqual([null, null]);
    expect(out.revisionGuarded).toBe(false);
  });

  it('falls back with not-found and does not call Google for it', async () => {
    const { service, client } = setup();
    const out = await service.comment(user, comments('text that is not in the doc'));
    expect(reasons(out)).toEqual(['not-found']);
    expect(client.insertComment).not.toHaveBeenCalled();
  });

  it('falls back with ambiguous when the quote occurs in two paragraphs', async () => {
    const doc = docOf(['repeat me one', 'repeat me two']);
    const { service, client } = setup({ getDocument: jest.fn(async () => doc) });
    const out = await service.comment(user, { ...comments('repeat me'), textHash: textHash(flattenDocument(doc)) });
    expect(reasons(out)).toEqual(['ambiguous']);
    expect(client.insertComment).not.toHaveBeenCalled();
  });

  it.each([
    ['forbidden', 403],
    ['no_access', 404],
  ] as const)('%s on the first write stops the whole batch', async (reason, status) => {
    const insertComment = insertMock(async () => { throw new GoogleDocsError(reason, status, ''); });
    const { service } = setup({ insertComment });
    const out = await service.comment(user, comments('alpha one', 'beta two', 'gamma three'));
    expect(reasons(out)).toEqual(['no-comment-access', 'no-comment-access', 'no-comment-access']);
    expect(placements(out)).toEqual(['fallback', 'fallback', 'fallback']);
    expect(insertComment).toHaveBeenCalledTimes(1);
  });

  it('reports a 5xx after the write as comment-uncertain and stops the rest', async () => {
    const insertComment = insertMock(async () => { throw new GoogleDocsError('uncertain', 503, 'upstream'); });
    const { service } = setup({ insertComment });
    const out = await service.comment(user, comments('alpha one', 'beta two', 'gamma three'));
    expect(reasons(out)).toEqual(['comment-uncertain', 'comment-failed', 'comment-failed']);
    expect(placements(out)).toEqual(['fallback', 'fallback', 'fallback']);
    expect(insertComment).toHaveBeenCalledTimes(1);
  });

  it('keeps going after another Google error', async () => {
    let call = 0;
    const insertComment = insertMock(async () => {
      if (++call === 1) throw new GoogleDocsError('bad_request', 400, '');
      return posted(`k${call}`);
    });
    const { service } = setup({ insertComment });
    const out = await service.comment(user, comments('alpha one', 'beta two', 'gamma three'));
    expect(reasons(out)).toEqual(['comment-failed', null, null]);
    expect(placements(out)).toEqual(['fallback', 'native', 'native']);
    expect(insertComment).toHaveBeenCalledTimes(3);
  });

  it('does not reuse findings after document text changes during a revision mismatch', async () => {
    let call = 0;
    const insertComment = insertMock(async () => {
      if (++call === 1) throw new GoogleDocsError('revision_mismatch', 400, 'revision');
      return posted('k2');
    });
    // The re-read comes back with a paragraph added above the quote, so it has moved.
    const moved = docOf(['a new first line', 'alpha one here', 'beta two here'], 'r9');
    const getDocument = jest.fn().mockResolvedValueOnce(standard).mockResolvedValueOnce(moved);
    const { service } = setup({ insertComment, getDocument });
    const out = await service.comment(user, comments('alpha one'));
    expect(placements(out)).toEqual(['fallback']);
    expect(reasons(out)).toEqual(['document-changed']);
    expect(insertComment).toHaveBeenCalledTimes(1);
  });

  it('refuses stale findings before any write even when the quoted passage remains', async () => {
    const { service, client } = setup({ getDocument: jest.fn(async () => docOf(['alpha one here', 'a changed conclusion'])) });
    const out = await service.comment(user, comments('alpha one', 'beta two'));
    expect(reasons(out)).toEqual(['document-changed', 'document-changed']);
    expect(client.insertComment).not.toHaveBeenCalled();
  });

  it('keeps the original document reference when a revision retry finds a relinked document with identical text', async () => {
    const { service, prisma, client } = setup();
    client.insertComment.mockImplementationOnce(async () => {
      prisma.submission.findFirst.mockResolvedValue({ id: 'sub1', fileUrl: FILE_URL.replace('1AAAA', '1BBBB') });
      throw new GoogleDocsError('revision_mismatch', 400, 'revision');
    });
    const out = await service.comment(user, comments('alpha one', 'beta two'));
    expect(reasons(out)).toEqual(['document-changed', 'document-changed']);
    expect(client.insertComment).toHaveBeenCalledTimes(1);
    expect(out.document.url).toBe(FILE_URL);
    expect(out.document.documentId).toBe('1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });

  it('retries a revision-only change when the reviewed text is unchanged', async () => {
    const insertComment = insertMock().mockRejectedValueOnce(new GoogleDocsError('revision_mismatch', 400, 'revision'));
    const getDocument = jest.fn().mockResolvedValueOnce(standard).mockResolvedValueOnce({ ...standard, revisionId: 'r9' });
    const { service } = setup({ insertComment, getDocument });
    expect(placements(await service.comment(user, comments('alpha one')))).toEqual(['native']);
    expect(insertComment.mock.calls.map(args => args[2])).toEqual(['r1', 'r9']);
  });

  it('reports an unguarded retry when Google no longer returns a revision', async () => {
    const insertComment = insertMock().mockRejectedValueOnce(new GoogleDocsError('revision_mismatch', 400, 'revision'));
    const getDocument = jest.fn().mockResolvedValueOnce(standard).mockResolvedValueOnce({ ...standard, revisionId: undefined });
    const { service } = setup({ insertComment, getDocument });
    const out = await service.comment(user, comments('alpha one'));
    expect(out.revisionGuarded).toBe(false);
    expect(insertComment.mock.calls[1][2]).toBeNull();
  });

  it('gives up with document-changed after a second mismatch, and still tries the next comment', async () => {
    let call = 0;
    const insertComment = insertMock(async () => {
      if (++call <= 2) throw new GoogleDocsError('revision_mismatch', 400, 'revision');
      return posted('k3');
    });
    const getDocument = jest.fn(async () => standard);
    const { service } = setup({ insertComment, getDocument });
    const out = await service.comment(user, comments('alpha one', 'beta two'));
    expect(reasons(out)).toEqual(['document-changed', null]);
    expect(placements(out)).toEqual(['fallback', 'native']);
    expect(insertComment).toHaveBeenCalledTimes(3);
    expect(getDocument).toHaveBeenCalledTimes(2); // the first read plus exactly one re-read
  });

  it('checks the flag right before every write', async () => {
    const events: string[] = [];
    const flags = jest.fn(() => { events.push('flag'); });
    const insertComment = insertMock(async () => { events.push('insert'); return posted('k'); });
    const { service } = setup({ flags, insertComment });
    await service.comment(user, comments('alpha one', 'beta two'));
    expect(events.slice(0, 2)).toEqual(['flag', 'flag']); // the snapshot's own checks
    expect(events.slice(-4)).toEqual(['flag', 'insert', 'flag', 'insert']);
  });

  it('stops before the first write when the flag goes off after the snapshot', async () => {
    let checks = 0;
    const flags = jest.fn(() => { if (++checks === 3) throw new NotFoundException(); }); // calls 1-2 are the snapshot
    const insertComment = insertMock(async () => posted('k'));
    const { service } = setup({ flags, insertComment });
    const error = await failure(service.comment(user, comments('alpha one', 'beta two')));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(insertComment).not.toHaveBeenCalled();
  });
});

describe('GoogleDocReviewService.comment errors that are not a Google answer', () => {
  it('reports the comment that hit the error as uncertain and the rest as not attempted', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const insertComment = insertMock(async () => { throw new TypeError('socket hang up'); });
      const { service } = setup({ insertComment });
      const out = await service.comment(user, comments('alpha one', 'beta two', 'gamma three'));
      expect(reasons(out)).toEqual(['comment-uncertain', 'comment-failed', 'comment-failed']);
      expect(insertComment).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('reports a 200 that Google did not confirm as uncertain, and keeps going', async () => {
    let call = 0;
    const insertComment = insertMock(async () => {
      if (++call === 1) throw new GoogleDocsError('uncertain', 200, 'PENDING');
      return posted('k2');
    });
    const { service } = setup({ insertComment });
    const out = await service.comment(user, comments('alpha one', 'beta two'));
    expect(reasons(out)).toEqual(['comment-uncertain', null]);
    expect(placements(out)).toEqual(['fallback', 'native']);
    expect(insertComment).toHaveBeenCalledTimes(2);
  });

  it('does not call a refusal from Google uncertain', async () => {
    const insertComment = insertMock(async () => { throw new GoogleDocsError('bad_request', 400, ''); });
    const { service } = setup({ insertComment });
    expect(reasons(await service.comment(user, comments('alpha one')))).toEqual(['comment-failed']);
  });
});

describe('GoogleDocReviewService.comment anchor read-back', () => {
  const withReadBack = (anchoredText: string | null) => insertMock(async () => ({ ...posted('k'), anchoredText }));
  const asComment = (out: { comments: readonly unknown[] }) => out.comments[0] as { anchoredText: string | null; anchorVerified: boolean | null };

  it('flags a comment Google attached to different text, and logs without the text', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const { service } = setup({ insertComment: withReadBack('pha one h') });
      const first = asComment(await service.comment(user, comments('alpha one')));
      expect(first).toMatchObject({ anchoredText: 'pha one h', anchorVerified: false });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).not.toMatch(/alpha|pha one/);
    } finally {
      warn.mockRestore();
    }
  });

  it('verifies when the read-back matches', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const { service } = setup({ insertComment: withReadBack('alpha one') });
      expect(asComment(await service.comment(user, comments('alpha one')))).toMatchObject({ anchorVerified: true });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('verifies across curly and straight quotes', async () => {
    const doc = docOf(['the it\u2019s clause here']);
    const { service } = setup({
      getDocument: jest.fn(async () => doc),
      insertComment: withReadBack('it\u2019s clause'),
    });
    expect(asComment(await service.comment(user, { ...comments("it's clause"), textHash: textHash(flattenDocument(doc)) }))).toMatchObject({ anchorVerified: true });
  });

  it('leaves anchorVerified null when Google gave no read-back', async () => {
    const { service } = setup({ insertComment: withReadBack(null) });
    expect(asComment(await service.comment(user, comments('alpha one')))).toMatchObject({ anchoredText: null, anchorVerified: null });
  });

  it('has no read-back on a fallback', async () => {
    const { service } = setup();
    expect(asComment(await service.comment(user, comments('not in the doc')))).toMatchObject({ anchoredText: null, anchorVerified: null });
  });
});

describe('GoogleDocReviewService.read', () => {
  it('skips empty paragraphs and never returns tab ids or indices', async () => {
    const { service } = setup({ getDocument: jest.fn(async () => docOf(['first', '', 'second'])) });
    const out = await service.read(user, target);
    expect(out.paragraphs.map((p) => p.text)).toEqual(['first', 'second']);
    expect(out.paragraphs.every((p) => Object.keys(p).sort().join() === 'n,section,text')).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/tabId|startIndex/);
  });

  it('marks the result truncated past 100,000 characters and drops the rest', async () => {
    const big = 'x'.repeat(40_000);
    const { service } = setup({ getDocument: jest.fn(async () => docOf([big, big, big])) });
    const out = await service.read(user, target);
    expect(out.truncated).toBe(true);
    expect(out.paragraphs).toHaveLength(2);
  });

  it('is not truncated when the text fits', async () => {
    const { service } = setup();
    expect((await service.read(user, target)).truncated).toBe(false);
  });
});

describe('GoogleDocReviewService snapshot errors', () => {
  const read = (over: Parameters<typeof setup>[0]) => {
    const parts = setup(over);
    return { ...parts, run: () => parts.service.read(user, target) };
  };

  it('explains how to share the document when the bot cannot open it', async () => {
    const { run } = read({ getDocument: jest.fn(async () => { throw new GoogleDocsError('no_access', 404, ''); }) });
    const error = await failure(run());
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({ code: 'DOC_NO_ACCESS' });
    expect(error.getResponse().message).toContain(BOT);
  });

  it('reports a rejected service account as not set up', async () => {
    const { run } = read({ getDocument: jest.fn(async () => { throw new GoogleDocsError('auth', 401, ''); }) });
    expect((await failure(run())).getResponse()).toMatchObject({ code: 'DOC_NOT_CONFIGURED' });
  });

  it('reports missing credentials as not set up without calling Google', async () => {
    const { run, client } = read({ configured: false });
    expect((await failure(run())).getResponse()).toMatchObject({ code: 'DOC_NOT_CONFIGURED' });
    expect(client.getDocument).not.toHaveBeenCalled();
  });

  it('rejects a link that is not a Google Doc', async () => {
    const { run, client } = read({ submission: { id: 'sub1', fileUrl: 'https://docs.google.com/spreadsheets/d/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit' } });
    expect((await failure(run())).getResponse()).toMatchObject({ code: 'DOC_LINK_UNSUPPORTED' });
    expect(client.getDocument).not.toHaveBeenCalled();
  });

  it('treats a missing submission as not found or forbidden', async () => {
    const { run } = read({ submission: null });
    expect((await failure(run())).getResponse()).toMatchObject({ code: 'NOT_FOUND_OR_FORBIDDEN' });
  });

  it('only looks up submissions that belong to the requested deliverable', async () => {
    const { service, prisma } = setup();
    await service.read(user, target);
    expect(prisma.submission.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sub1', deliverableId: 'd1' } }));
  });
});
