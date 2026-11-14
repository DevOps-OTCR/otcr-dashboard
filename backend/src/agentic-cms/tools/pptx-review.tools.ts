import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { GraphError, MicrosoftGraphService } from '../../integrations/pptx/microsoft-graph.service';
import { PptxCommentWriterService } from '../../integrations/pptx/pptx-comment-writer.service';
import { PptxReaderService } from '../../integrations/pptx/pptx-reader.service';
import { PptxRendererService } from '../../integrations/pptx/pptx-renderer.service';
import type { DeckContent, Finding } from '../../integrations/pptx/pptx.types';
import type { AgentTool, ToolContext, ToolOutput } from './tool.types';
import { ToolFailure } from './tool.types';

function graphFailure(err: GraphError): ToolFailure {
  return new ToolFailure(err.userMessage, err.userMessage);
}

function formatDeckSummary(deck: DeckContent, url: string, eTag: string, versionId?: string): string {
  const slides = deck.slides.map((s) => {
    const shapes = s.shapes
      .map((sh) => `    - [${sh.type}] spId=${sh.spId} "${sh.name}"${sh.text ? `: "${sh.text.slice(0, 80)}${sh.text.length > 80 ? '…' : ''}"` : ''}`)
      .join('\n');
    return [
      `Slide ${s.index} (sldId=${s.sldId}${s.creationId ? `, creationId=${s.creationId}` : ''})`,
      `  Title: ${s.title || '(none)'}`,
      s.bodyText.length ? `  Body: ${s.bodyText.map((t) => `"${t.slice(0, 100)}"`).join('; ')}` : '',
      s.speakerNotes ? `  Notes: "${s.speakerNotes.slice(0, 150)}"` : '',
      shapes ? `  Shapes:\n${shapes}` : '',
    ].filter(Boolean).join('\n');
  });

  return [
    `Deck: ${url}`,
    `Slides: ${deck.slideCount}`,
    `eTag: ${eTag}`,
    versionId ? `Version: ${versionId}` : '',
    '',
    ...slides,
  ].filter((l) => l !== undefined).join('\n');
}

@Injectable()
export class PptxReviewTools {
  readonly tools: AgentTool[];

  constructor(
    private readonly graph: MicrosoftGraphService,
    private readonly reader: PptxReaderService,
    private readonly commentWriter: PptxCommentWriterService,
    private readonly renderer: PptxRendererService,
    private readonly flags: FeatureFlagsService,
  ) {
    this.tools = [
      this.fetchContentTool(),
      this.getSlideImagesTool(),
      this.addCommentsTool(),
    ];
  }

  isConfigured(): boolean {
    return this.graph.isConfigured();
  }

  private fetchContentTool(): AgentTool {
    return {
      name: 'fetch_pptx_content',
      description:
        'Fetch the content of a PowerPoint file from a OneDrive or SharePoint submission link. ' +
        'Returns all slide titles, body text, speaker notes and shape inventory, plus an eTag. ' +
        'Get the URL from get_deliverable section=submissions (use the fileUrl of the most recent version). ' +
        'Call this before reviewing any PPTX deliverable submission. Do not ask for confirmation first.',
      input: z.object({
        url: z.string().url().describe('OneDrive/SharePoint share link or direct .pptx URL'),
      }),
      isAvailable: () => this.graph.isConfigured(),
      label: ({ url }) => `Fetching PPTX: ${new URL(url).hostname}…`,
      run: async ({ url }): Promise<ToolOutput> => {
        let ref;
        try {
          ref = await this.graph.resolveLink(url);
        } catch (err) {
          if (err instanceof GraphError) throw graphFailure(err);
          throw err;
        }

        let buffer: Buffer;
        try {
          buffer = await this.graph.downloadPptx(ref);
        } catch (err) {
          if (err instanceof GraphError) throw graphFailure(err);
          throw err;
        }

        const deck = await this.reader.extractDeck(buffer);
        const summary = formatDeckSummary(deck, url, ref.eTag, ref.versionId);

        const directNote = ref.directDownload
          ? '\n\nNote: This was a direct download link. Native comments cannot be written back — findings will be text-only.'
          : '';

        return {
          content: summary + directNote,
          note: `${deck.slideCount} slides`,
        };
      },
    };
  }

  private getSlideImagesTool(): AgentTool {
    return {
      name: 'get_pptx_slide_images',
      description:
        'Render a PowerPoint file to slide images for visual layout inspection. ' +
        'Call this after fetch_pptx_content and before add_pptx_comments — the rendered images let you check ' +
        'layout density, chart selection, text overflow, and visual quality that text extraction cannot detect. ' +
        'Returns one image per slide (up to 20). ' +
        'Requires MSGRAPH_VISION_ENABLED=true; if the tool tells you vision is not enabled, skip it and proceed with a text-only review.',
      input: z.object({
        url: z.string().url().describe('OneDrive/SharePoint share link (must be resolvable via Graph API)'),
        slide_indices: z
          .array(z.number().int().min(1))
          .max(20)
          .optional()
          .describe('1-based slide indices to render; omit for all slides (max 20)'),
      }),
      isAvailable: () => this.graph.isConfigured(),
      label: ({ url }) => `Rendering slides: ${new URL(url).hostname}…`,
      run: async ({ url, slide_indices }): Promise<ToolOutput> => {
        if (!this.renderer.isVisionEnabled()) {
          return {
            content:
              'Slide image rendering is not enabled for the current model configuration. ' +
              'Set MSGRAPH_VISION_ENABLED=true and configure a vision-capable model endpoint to use this feature. ' +
              'Proceed with text-only review using fetch_pptx_content.',
            note: 'Vision not enabled',
          };
        }

        let ref;
        try {
          ref = await this.graph.resolveLink(url);
        } catch (err) {
          if (err instanceof GraphError) throw graphFailure(err);
          throw err;
        }

        if (ref.directDownload) {
          return {
            content: 'PDF conversion requires a OneDrive share link, not a direct download URL.',
            note: 'Cannot convert to PDF',
          };
        }

        let pdfBuffer: Buffer;
        try {
          pdfBuffer = await this.graph.downloadAsPdf(ref);
        } catch (err) {
          if (err instanceof GraphError) throw graphFailure(err);
          throw err;
        }

        const result = await this.renderer.renderSlides(pdfBuffer, slide_indices);
        if (!result.available) {
          return { content: (result as { available: false; reason: string }).reason, note: 'Render unavailable' };
        }
        return {
          content: `Rendered ${result.slides.length} slide image${result.slides.length === 1 ? '' : 's'}. Each image shows the full visual layout of the slide for review.`,
          note: `${result.slides.length} slide${result.slides.length === 1 ? '' : 's'} rendered`,
          images: result.slides.map((s) => ({ base64: s.pngBase64, mimeType: s.mimeType })),
        };
      },
    };
  }

  private addCommentsTool(): AgentTool {
    const findingSchema = z.object({
      slideIndex: z.number().int().min(1).describe('1-based slide number'),
      shapeId: z.string().optional().describe('Optional shape spId for shape-level anchoring; omit to anchor to the slide'),
      severity: z.enum(['BLOCKING', 'MATERIAL', 'MINOR']),
      comment: z.string().min(1).max(2000).describe('Review finding text'),
    });

    return {
      name: 'add_pptx_comments',
      description:
        'Write review findings as native modern comments into a PowerPoint file and upload it back to OneDrive. ' +
        'Call this immediately after completing the review — do not ask the user for confirmation first. ' +
        'The eTag from the most recent fetch_pptx_content call is used to detect concurrent edits. ' +
        'On success: comments appear in PowerPoint for the web and desktop. ' +
        'On stale (deck edited since fetch) or locked: returns findings as text for manual application. ' +
        'On legacy-format decks: same text fallback.',
      input: z.object({
        url: z.string().url().describe('The same OneDrive/SharePoint link used in fetch_pptx_content'),
        etag: z.string().describe('eTag value returned by fetch_pptx_content'),
        findings: z.array(findingSchema).min(1).max(50).describe('Review findings to write as comments'),
      }),
      isAvailable: () => this.graph.isConfigured(),
      label: ({ findings }) => `Writing ${findings.length} comment${findings.length === 1 ? '' : 's'} to deck…`,
      run: async ({ url, etag, findings }, ctx: ToolContext): Promise<ToolOutput> => {
        let ref;
        try {
          ref = await this.graph.resolveLink(url);
        } catch (err) {
          if (err instanceof GraphError) throw graphFailure(err);
          throw err;
        }

        if (ref.directDownload) {
          return {
            content: JSON.stringify({
              outcome: 'direct_download',
              message: 'Cannot write native comments to a direct download link. Here are the findings for manual application:',
              findings: formatFindingsText(findings),
            }),
            note: 'Text fallback',
          };
        }

        let buffer: Buffer;
        try {
          buffer = await this.graph.downloadPptx(ref);
        } catch (err) {
          if (err instanceof GraphError) throw graphFailure(err);
          throw err;
        }

        const deck = await this.reader.extractDeck(buffer);
        const { buffer: modified, legacy, commentCount, sanitized } = await this.commentWriter.writeComments(buffer, findings as Finding[], deck);

        if (legacy) {
          return {
            content: JSON.stringify({
              outcome: 'legacy_format',
              message: 'This deck uses the legacy comment format and cannot receive modern comments. Here are the findings for manual application:',
              findings: formatFindingsText(findings),
            }),
            note: 'Legacy format — text fallback',
          };
        }

        if (commentCount === 0) {
          const requested = [...new Set(findings.map((f) => f.slideIndex))].sort((a: number, b: number) => a - b);
          const available = deck.slides.map((s) => s.index).sort((a, b) => a - b);
          if (!sanitized) {
            return {
              content: JSON.stringify({
                outcome: 'no_comments_written',
                message: `No comments were written. The slideIndex values you used [${requested.join(', ')}] did not match any slide in the deck. Valid slideIndex values are [${available.join(', ')}]. Retry add_pptx_comments using only those values.`,
                findings: formatFindingsText(findings),
              }),
              note: 'No comments written',
            };
          }
          // Sanitization removed stale bad-namespace files — upload the cleaned buffer even
          // though no new comments were added, so PowerPoint stops flagging the file as damaged.
        }

        let upload;
        this.flags.assertAgenticCmsEnabledFor(ctx.user.email); // recheck immediately before the external write
        try {
          upload = await this.graph.uploadPptx(ref, modified, etag);
        } catch (err) {
          if (err instanceof GraphError) throw graphFailure(err);
          throw err;
        }

        if (upload.status === 412) {
          return {
            content: JSON.stringify({
              outcome: 'stale',
              message: 'The deck was edited after this review began. The findings below are based on the reviewed snapshot — apply them once the latest version is available.',
              findings: formatFindingsText(findings),
            }),
            note: 'Deck edited — text fallback',
          };
        }

        if (upload.status === 423) {
          return {
            content: JSON.stringify({
              outcome: 'locked',
              message:
                'The deck is locked — another Office app (most likely PowerPoint desktop) has it open for editing. ' +
                'To unlock: (1) close the file on every device including mobile, (2) wait 1–2 minutes for the lock to expire, ' +
                '(3) if it still persists, open the file in SharePoint/OneDrive web, right-click it, and look for "Discard checkout". ' +
                'Once unlocked, ask me to write the comments again and I will retry automatically.',
              findings: formatFindingsText(findings),
            }),
            note: 'Deck locked — text fallback',
          };
        }

        if (upload.status !== 200 && upload.status !== 201) {
          return {
            content: JSON.stringify({
              outcome: 'error',
              message: `Upload returned HTTP ${upload.status}. Here are the findings for manual application:`,
              findings: formatFindingsText(findings),
            }),
            note: `Upload error ${upload.status}`,
          };
        }

        const skipped = findings.length - commentCount;
        const sanitizeNote = sanitized && commentCount === 0 ? ' Stale bad-namespace comment files were removed — the repair prompt should no longer appear.' : '';
        return {
          content: JSON.stringify({
            outcome: 'comments_live',
            message: `${commentCount} comment${commentCount === 1 ? '' : 's'} written to the deck. Open it in PowerPoint for the web to see them.${skipped ? ` (${skipped} finding${skipped === 1 ? '' : 's'} skipped — slide index not found in deck)` : ''}${sanitizeNote}`,
            newEtag: upload.newEtag,
            slidesSeen: deck.slideCount,
          }),
          note: commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? '' : 's'} live` : 'Stale files cleaned',
        };
      },
    };
  }
}

function formatFindingsText(findings: Array<{ slideIndex: number; severity: string; comment: string; shapeId?: string }>): string {
  return findings
    .map((f) => `Slide ${f.slideIndex}${f.shapeId ? ` (shape ${f.shapeId})` : ''} [${f.severity}]: ${f.comment}`)
    .join('\n');
}
