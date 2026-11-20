import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

it('renders a real PDF through CommonJS/ESM and refuses oversized pages before native allocation', () => {
  const script = `
    require('ts-node/register');
    const assert = require('node:assert/strict');
    const { PptxRendererService } = require(${JSON.stringify(join(__dirname, 'pptx-renderer.service.ts'))});
    const canvasModule = require(require.resolve('@napi-rs/canvas', { paths: [require.resolve('pdfjs-dist/package.json')] }));
    const nativeCreate = canvasModule.createCanvas;
    let allocations = 0;
    canvasModule.createCanvas = (width, height, ...args) => {
      assert.ok(width <= 4096 && height <= 4096 && width * height <= 8000000, 'oversized native allocation attempted');
      allocations++;
      return nativeCreate(width, height, ...args);
    };
    function blankPdf(width, height) {
      const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + width + ' ' + height + '] /Resources << >> >>',
      ];
      let pdf = '%PDF-1.4\\n';
      const offsets = [];
      for (const [index, body] of objects.entries()) {
        offsets.push(Buffer.byteLength(pdf));
        pdf += (index + 1) + ' 0 obj\\n' + body + '\\nendobj\\n';
      }
      const xref = Buffer.byteLength(pdf);
      pdf += 'xref\\n0 4\\n0000000000 65535 f \\n';
      for (const offset of offsets) pdf += String(offset).padStart(10, '0') + ' 00000 n \\n';
      pdf += 'trailer\\n<< /Size 4 /Root 1 0 R >>\\nstartxref\\n' + xref + '\\n%%EOF\\n';
      return Buffer.from(pdf);
    }
    (async () => {
      const renderer = new PptxRendererService({ get: (key) => key === 'MSGRAPH_VISION_ENABLED' ? 'true' : undefined });
      const result = await renderer.renderSlides(blankPdf(72, 36));
      assert.equal(result.available, true, JSON.stringify(result));
      assert.equal(result.slides.length, 1);
      const slide = result.slides[0];
      assert.equal(slide.slideIndex, 1);
      assert.equal(slide.mimeType, 'image/png');
      assert.equal(slide.widthPx, 72);
      assert.equal(slide.heightPx, 36);
      assert.equal(Buffer.from(slide.pngBase64, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.match(result.warning, /incomplete/);
      assert.ok(allocations > 0, 'normal page must use the real native canvas');
      const allocationsBeforeHugePage = allocations;
      const refused = await renderer.renderSlides(blankPdf(1000000, 1000000));
      assert.equal(refused.available, false);
      assert.match(refused.reason, /canvas limit/);
      assert.equal(allocations, allocationsBeforeHugePage, 'oversized page must be rejected before native allocation');
      process.stdout.write('real-render-ok');
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  expect(execFileSync(process.execPath, ['-e', script], {
    cwd: join(__dirname, '../../..'), timeout: 20_000, encoding: 'utf8',
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
  })).toContain('real-render-ok');
}, 25_000);
