import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pathToFileURL } from 'node:url';

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
      // Preserve native import in the CommonJS backend; pdf-to-img and PDF.js are ESM.
      const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<typeof import('pdf-to-img')>;
      const mod = await nativeImport(pathToFileURL(require.resolve('pdf-to-img')).href);
      pdfFn = mod.pdf as typeof pdfFn;
    } catch (err) {
      this.log.error(`Failed to load pdf-to-img: ${err instanceof Error ? err.name : 'unknown'}`);
      return { available: false, reason: 'PDF rendering library could not be loaded.' };
    }

    let doc: Awaited<ReturnType<typeof pdfFn>> | null = null;
    try {
      doc = await pdfFn(pdfBuffer, { scale: 1.0 });
      const pageCount = doc.length;
      if (pageCount > 200) return { available: false, reason: 'This deck exceeds the 200 slide rendering limit.' };
      const indices = slideIndices?.length
        ? [...new Set(slideIndices)].filter((i) => Number.isInteger(i) && i >= 1 && i <= pageCount).slice(0, DEFAULT_MAX_SLIDES)
        : Array.from({ length: Math.min(pageCount, DEFAULT_MAX_SLIDES) }, (_, i) => i + 1);

      const slides: SlideImage[] = [];
      for (const idx of indices) {
        const png = await doc.getPage(idx);
        const { widthPx, heightPx } = pngDimensions(png);
        slides.push({ slideIndex: idx, pngBase64: png.toString('base64'), mimeType: 'image/png', widthPx, heightPx });
      }
      return { available: true, slides };
    } catch (err) {
      this.log.error(`PDF rendering failed: ${err instanceof Error ? err.name : 'unknown'}`);
      return { available: false, reason: 'PDF rendering failed — check server logs.' };
    } finally {
      await doc?.destroy().catch(() => undefined);
    }
  }
}
