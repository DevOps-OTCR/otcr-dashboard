import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

it('renders a real PDF through the CommonJS backend and native ESM renderer', () => {
  const rendererPath = join(__dirname, 'pptx-renderer.service.ts');
  const script = `
    require('ts-node/register');
    const assert = require('node:assert/strict');
    const { PptxRendererService } = require(${JSON.stringify(rendererPath)});
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 36] /Resources << >> >>',
    ];
    let pdf = '%PDF-1.4\\n';
    const offsets = [0];
    for (const [index, body] of objects.entries()) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += (index + 1) + ' 0 obj\\n' + body + '\\nendobj\\n';
    }
    const xref = Buffer.byteLength(pdf);
    pdf += 'xref\\n0 4\\n0000000000 65535 f \\n';
    for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0') + ' 00000 n \\n';
    pdf += 'trailer\\n<< /Size 4 /Root 1 0 R >>\\nstartxref\\n' + xref + '\\n%%EOF\\n';
    (async () => {
      const renderer = new PptxRendererService({ get: (key) => key === 'MSGRAPH_VISION_ENABLED' ? 'true' : undefined });
      const result = await renderer.renderSlides(Buffer.from(pdf));
      assert.equal(result.available, true, JSON.stringify(result));
      assert.equal(result.slides.length, 1);
      const slide = result.slides[0];
      assert.equal(slide.slideIndex, 1);
      assert.equal(slide.mimeType, 'image/png');
      assert.equal(slide.widthPx, 72);
      assert.equal(slide.heightPx, 36);
      assert.equal(Buffer.from(slide.pngBase64, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      process.stdout.write('real-render-ok');
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: join(__dirname, '../../..'), timeout: 20_000, encoding: 'utf8',
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
  });
  expect(output).toContain('real-render-ok');
}, 25_000);
