import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_MAX_SLIDES = 20;

export interface SlideImage {
  slideIndex: number;
  pngBase64: string;
  mimeType: string;
  widthPx: number;
  heightPx: number;
}

export type RenderResult =
  | { available: false; reason: string }
  | { available: true; slides: SlideImage[] };

function pngDimensions(buf: Buffer): { widthPx: number; heightPx: number } {
  // PNG: 8-byte magic + 4-byte IHDR length + 4-byte "IHDR" + 4-byte width + 4-byte height
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return { widthPx: 0, heightPx: 0 };
  return { widthPx: buf.readUInt32BE(16), heightPx: buf.readUInt32BE(20) };
}

@Injectable()
export class PptxRendererService {
  private readonly log = new Logger(PptxRendererService.name);

  constructor(private readonly config: ConfigService) {}

  isVisionEnabled(): boolean {
    return this.config.get<string>('MSGRAPH_VISION_ENABLED') === 'true';
  }

  async renderSlides(pdfBuffer: Buffer, slideIndices?: number[]): Promise<RenderResult> {
    if (!this.isVisionEnabled()) {
      return { available: false, reason: 'Set MSGRAPH_VISION_ENABLED=true and configure a vision-capable model to enable slide image rendering.' };
    }

    let pdfFn: (input: Buffer, opts: { scale: number }) => Promise<{ length: number; getPage: (n: number) => Promise<Buffer>; destroy: () => Promise<void> }>;
    try {
      const mod = await import('pdf-to-img');
      pdfFn = mod.pdf as typeof pdfFn;
    } catch (err) {
      this.log.error('Failed to load pdf-to-img', err);
      return { available: false, reason: 'PDF rendering library could not be loaded.' };
    }

    let doc: Awaited<ReturnType<typeof pdfFn>> | null = null;
    try {
      doc = await pdfFn(pdfBuffer, { scale: 1.0, format: 'jpeg' } as Parameters<typeof pdfFn>[1]);
      const pageCount = doc.length;
      const indices = slideIndices?.length
        ? slideIndices.filter((i) => i >= 1 && i <= pageCount)
        : Array.from({ length: Math.min(pageCount, DEFAULT_MAX_SLIDES) }, (_, i) => i + 1);

      const slides: SlideImage[] = [];
      for (const idx of indices) {
        const png = await doc.getPage(idx);
        const { widthPx, heightPx } = pngDimensions(png);
        slides.push({ slideIndex: idx, pngBase64: png.toString('base64'), mimeType: 'image/jpeg', widthPx, heightPx });
      }
      return { available: true, slides };
    } catch (err) {
      this.log.error('PDF rendering failed', err);
      return { available: false, reason: 'PDF rendering failed — check server logs.' };
    } finally {
      await doc?.destroy().catch(() => undefined);
    }
  }
}
