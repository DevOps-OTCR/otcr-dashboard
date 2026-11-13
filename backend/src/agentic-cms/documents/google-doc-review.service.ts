import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import * as z from 'zod';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CmsReadAccessService, CmsReader } from '../authorization/cms-read-access.service';
import { DocParagraph, findQuote, flattenDocument, normalize, parseGoogleDocLink, textHash } from './google-doc';
import { GoogleDocsClient, GoogleDocsError } from './google-docs.client';

const MAX_TEXT_CHARS = 100_000;
const id = z.string().trim().min(1).max(200);
const target = {
  projectId: id.describe('CMS project ID supplied by the selected project or the user. Do not guess IDs.'),
  deliverableId: id.describe('A deliverableId from list_deliverables or get_workstream in the same project.'),
  submissionId: id.describe('A submissions.items[].id from get_deliverable section=submissions whose link is a Google Doc.'),
};
const documentRef = z.object({
  submissionId: z.string(), url: z.string(), documentId: z.string(), title: z.string().nullable(),
  revisionId: z.string().nullable().describe('Google revision read; null when the bot lacks edit access.'),
  textHash: z.string().describe('Hash of the text reviewed; identifies the snapshot even without revisionId.'),
  capturedAt: z.iso.datetime(),
});

export const readGoogleDocInput = z.strictObject(target);
export const readGoogleDocOutput = z.object({
  schemaVersion: z.literal('1'),
  document: documentRef,
  paragraphs: z.array(z.object({ n: z.number(), section: z.string().nullable(), text: z.string() })),
  truncated: z.boolean().describe('True when later paragraphs were omitted to fit the size limit.'),
});

// comment-uncertain: the request may have reached Google but its answer was lost, so the comment
// may already be in the document. comment-failed: it was not attempted, or Google refused it.
const fallbackReason = z.enum(['not-found', 'ambiguous', 'no-comment-access', 'document-changed', 'comment-failed', 'comment-uncertain']);
export const commentGoogleDocInput = z.strictObject({
  ...target,
  comments: z.array(z.strictObject({
    quote: z.string().trim().min(3).max(500).describe('Exact text copied from one paragraph of read_google_doc output. Must occur once in the document; add surrounding words if it repeats.'),
    comment: z.string().trim().min(1).max(2000).describe('Plain-text review comment.'),
  })).min(1).max(20),
});
export const commentGoogleDocOutput = z.object({
  schemaVersion: z.literal('1'),
  document: documentRef,
  revisionGuarded: z.boolean().describe('False when Google gave no revisionId, so comments were placed without a stale-index check.'),
  comments: z.array(z.object({
    quote: z.string(), comment: z.string(), section: z.string().nullable(),
    placement: z.enum(['native', 'fallback']),
    nativeCommentId: z.string().nullable(),
    fallbackReason: fallbackReason.nullable(),
    anchoredText: z.string().nullable().describe("The text Google says the comment is attached to, read back after posting; null for fallbacks."),
    anchorVerified: z.boolean().nullable().describe('False when Google attached the comment to different text than the quote; null when not checked.'),
  })),
});

type Snapshot = z.infer<typeof documentRef> & { paragraphs: DocParagraph[] };
type CommentResult = z.infer<typeof commentGoogleDocOutput>['comments'][number];

const fail = (Exception: new (body: object) => HttpException, code: string, message: string) => new Exception({ code, message });

/**
 * Reads Google Docs submitted to the CMS and places anchored review comments.
 * The document link always comes from a CMS submission the user can already see,
 * never from tool input, so shared-with-the-bot docs from other projects stay out of reach.
 */
@Injectable()
export class GoogleDocReviewService {
  private readonly log = new Logger('GoogleDocReview');

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CmsReadAccessService,
    private readonly flags: FeatureFlagsService,
    private readonly docs: GoogleDocsClient,
  ) {}

  async read(user: CmsReader, input: z.infer<typeof readGoogleDocInput>): Promise<z.infer<typeof readGoogleDocOutput>> {
    await this.access.assertDeliverableAccess(user, input.projectId, input.deliverableId);
    const snap = await this.snapshot(user, input);
    let used = 0;
    const paragraphs = [];
    for (const p of snap.paragraphs) {
      if (!p.text.trim()) continue;
      used += p.text.length;
      if (used > MAX_TEXT_CHARS) break;
      paragraphs.push({ n: p.n, section: p.section, text: p.text });
    }
    return { schemaVersion: '1', document: documentRef.parse(snap), paragraphs, truncated: used > MAX_TEXT_CHARS };
  }

  async comment(user: CmsReader, input: z.infer<typeof commentGoogleDocInput>): Promise<z.infer<typeof commentGoogleDocOutput>> {
    // Posting is a reviewer action: same roles that may write project context (admin, LC, the project's PM).
    await this.access.assertContextWrite(user, input.projectId);
    await this.access.assertDeliverableAccess(user, input.projectId, input.deliverableId);
    let snap = await this.snapshot(user, input);
    const revisionGuarded = Boolean(snap.revisionId);
    // Once set, every remaining comment falls back with this reason instead of trying Google.
    let stopReason: z.infer<typeof fallbackReason> | null = null;
    const results: CommentResult[] = [];

    // Once this loop starts, only the feature-flag check may throw. A comment that has already
    // been posted must always be returned, or a retry would post it a second time.
    for (const { quote, comment } of input.comments) {
      const result: CommentResult = {
        quote, comment, section: null, placement: 'fallback', nativeCommentId: null, fallbackReason: null, anchoredText: null, anchorVerified: null,
      };
      results.push(result);
      if (stopReason) { result.fallbackReason = stopReason; continue; }

      for (let attempt = 0; ; attempt++) {
        const match = findQuote(snap.paragraphs, quote);
        if ('reason' in match) { result.fallbackReason = match.reason; break; }
        result.section = match.section;
        this.flags.assertAgenticCmsEnabledFor(user.email); // recheck immediately before the external write
        try {
          const posted = await this.docs.insertComment(snap.documentId, { content: comment, ...match }, snap.revisionId);
          // Google reads back the text it attached the comment to; a difference means an index or
          // revision problem placed it somewhere other than the quote. Never log the text itself.
          const anchoredText = posted.anchoredText ?? null;
          const anchorVerified = anchoredText === null ? null : normalize(anchoredText).trim() === normalize(quote).trim();
          if (anchorVerified === false) this.log.warn('Google anchored a comment to different text than requested');
          Object.assign(result, { placement: 'native', nativeCommentId: posted.commentId, fallbackReason: null, anchoredText, anchorVerified });
          // Each comment bumps the revision; carry it forward so the next guarded write doesn't mismatch.
          if (snap.revisionId && posted.nextRevisionId) snap = { ...snap, revisionId: posted.nextRevisionId };
          break;
        } catch (error) {
          if (error instanceof GoogleDocsError && error.reason === 'revision_mismatch' && attempt === 0) {
            try {
              snap = await this.snapshot(user, input);
              continue;
            } catch {
              // Never post against a snapshot we could not refresh. If the re-read failed because the
              // flag went off, this recheck throws and stops everything, as it must.
              this.flags.assertAgenticCmsEnabledFor(user.email);
              result.fallbackReason = 'document-changed';
              stopReason = 'document-changed';
              break;
            }
          }
          if (error instanceof GoogleDocsError && (error.reason === 'forbidden' || error.reason === 'no_access')) {
            stopReason = 'no-comment-access';
            result.fallbackReason = stopReason;
          } else if (error instanceof GoogleDocsError) {
            // Google answered, so keep going; but an unconfirmed save may exist and must not be retried blindly.
            result.fallbackReason = error.reason === 'revision_mismatch' ? 'document-changed' : error.reason === 'uncertain' ? 'comment-uncertain' : 'comment-failed';
          } else {
            // Not a Google answer (network failure, timeout, a bug). The request may have reached Google
            // and only its answer been lost, so this comment may already be in the document: say so
            // instead of "failed". The rest were never attempted; stop rather than wait on Google once
            // per remaining comment. Log the class only; messages may carry document text.
            this.log.warn(`Unexpected error posting a Google Doc comment: ${error instanceof Error ? error.name : typeof error}`);
            result.fallbackReason = 'comment-uncertain';
            stopReason = 'comment-failed';
          }
          break;
        }
      }
    }
    return { schemaVersion: '1', document: documentRef.parse(snap), revisionGuarded, comments: results };
  }

  private async snapshot(user: CmsReader, input: z.infer<typeof readGoogleDocInput>): Promise<Snapshot> {
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const submission = await this.prisma.submission.findFirst({
      where: { id: input.submissionId, deliverableId: input.deliverableId },
      select: { id: true, fileUrl: true },
    });
    if (!submission) throw fail(NotFoundException, 'NOT_FOUND_OR_FORBIDDEN', 'The requested CMS record is unavailable.');
    const link = parseGoogleDocLink(submission.fileUrl);
    if (!link) {
      throw fail(BadRequestException, 'DOC_LINK_UNSUPPORTED',
        'This submission is not a Google Docs link (https://docs.google.com/document/d/...). Only Google Docs can be read and commented on.');
    }
    if (!this.docs.isConfigured()) throw fail(ServiceUnavailableException, 'DOC_NOT_CONFIGURED', 'Google Docs review is not set up on this server.');

    let doc;
    try {
      doc = await this.docs.getDocument(link.documentId);
    } catch (error) {
      throw this.toHttp(error);
    }
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const paragraphs = flattenDocument(doc);
    return {
      submissionId: submission.id, url: submission.fileUrl, documentId: link.documentId, title: doc.title ?? null,
      revisionId: doc.revisionId ?? null, textHash: textHash(paragraphs), capturedAt: new Date().toISOString(), paragraphs,
    };
  }

  private toHttp(error: unknown): HttpException {
    if (!(error instanceof GoogleDocsError)) return fail(ServiceUnavailableException, 'DOC_UNAVAILABLE', 'Google Docs is temporarily unavailable.');
    const bot = this.docs.serviceAccountEmail();
    switch (error.reason) {
      case 'no_access':
      case 'forbidden':
        return fail(ForbiddenException, 'DOC_NO_ACCESS',
          `The review bot cannot open this document. Check the link, then share the doc with ${bot} as Commenter (or Editor) and try again.`);
      case 'not_configured':
      case 'auth':
        return fail(ServiceUnavailableException, 'DOC_NOT_CONFIGURED', 'Google Docs review is not set up correctly on this server.');
      default:
        return fail(ServiceUnavailableException, 'DOC_UNAVAILABLE', 'Google Docs is temporarily unavailable.');
    }
  }
}
