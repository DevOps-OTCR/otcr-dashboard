const fs = require('fs');
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd()] }));

const outDir = process.argv[2];

const FROM = '2026-11-02T06:00:00.000Z';
const TO = '2026-11-16T06:00:00.000Z';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  const api = context.request;

  const results = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function call(method, urlPath, email, body) {
    const res = await api.fetch('http://localhost:4100' + urlPath, {
      method,
      headers: email ? { Authorization: 'Bearer ' + email } : {},
      data: body,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = null;
    }
    return { status: res.status(), json, text };
  }

  async function scene(n, slug, title, requestLine, status, jsonValue, checks) {
    const pass = checks.filter((c) => c[0]).length;
    const fail = checks.length - pass;
    results.push({ title, pass, fail });

    const chips = checks
      .map(
        (c) =>
          '<span class="chip ' +
          (c[0] ? 'ok' : 'bad') +
          '">' +
          (c[0] ? 'PASS' : 'FAIL') +
          '</span> <span class="ctext">' +
          esc(c[1]) +
          '</span>'
      )
      .join('<br>');

    const pretty =
      jsonValue == null ? '(no JSON body)' : JSON.stringify(jsonValue, null, 2);

    const html =
      '<!doctype html><html><head><meta charset="utf-8"><style>' +
      '*{box-sizing:border-box}' +
      'body{margin:0;background:#0f1115;color:#e6e9ef;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;justify-content:center;padding:36px 24px}' +
      '.wrap{width:100%;max-width:1200px}' +
      'header{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8b93a7;border-bottom:1px solid #232838;padding-bottom:14px;margin-bottom:26px}' +
      'h2{font-size:30px;margin:0 0 18px;font-weight:650}' +
      '.req{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;background:#161a23;border:1px solid #232838;border-radius:8px;padding:12px 14px;color:#c8d0e0;margin-bottom:14px}' +
      '.status{display:inline-block;font-family:ui-monospace,monospace;font-size:15px;background:#1b2536;border:1px solid #2c3c56;color:#8fd0ff;border-radius:8px;padding:8px 14px;margin-bottom:22px}' +
      'pre{background:#141821;border:1px solid #232838;border-radius:10px;padding:18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5;max-height:430px;overflow:auto;margin:0 0 24px;color:#b9c4d6;white-space:pre}' +
      '.checks{display:block;line-height:2}' +
      '.chip{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.06em;border-radius:6px;padding:3px 9px;min-width:52px;text-align:center}' +
      '.chip.ok{background:#123524;color:#4ade80;border:1px solid #1d5e3c}' +
      '.chip.bad{background:#3a1620;color:#f87171;border:1px solid #6b2434}' +
      '.ctext{font-size:14px;color:#98a2b8}' +
      '</style></head><body><div class="wrap">' +
      '<header>Batch schedule endpoint — real NestJS API + Postgres 16 (local)</header>' +
      '<h2>' +
      esc(title) +
      '</h2>' +
      '<div class="req">' +
      esc(requestLine) +
      '</div>' +
      '<div class="status">HTTP ' +
      esc(status) +
      '</div>' +
      '<pre>' +
      esc(pretty) +
      '</pre>' +
      '<div class="checks">' +
      chips +
      '</div>' +
      '</div></body></html>';

    await page.setContent(html);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(outDir, n + '-' + slug + '.png') });
    console.log(JSON.stringify({ step: n, pass, fail }));
  }

  function ids(json) {
    const projects = (json && json.projects) || [];
    return projects.map((p) => p.id).sort();
  }

  function has(json, id) {
    const deliverables = (json && json.deliverables) || [];
    return deliverables.some((d) => d.id === id);
  }

  // 01 — con@otcr.test
  {
    const r = await call('GET', '/projects/schedule?from=' + FROM + '&to=' + TO, 'con@otcr.test');
    const j = r.json;
    const projects = (j && j.projects) || [];
    const checks = [
      [r.status === 200, 'status is 200'],
      [JSON.stringify(ids(j)) === JSON.stringify(['p-harbor', 'p-prairie']), 'project ids are ["p-harbor","p-prairie"]'],
      [projects.every((p) => p.canManage === false), 'all canManage === false'],
      [!has(j, 'd-h-draft'), 'd-h-draft not visible'],
      [!r.text.includes('pmId'), 'raw response does not contain "pmId"'],
    ];
    await scene('01', 'consumer', 'Consumer view', 'GET /projects/schedule?from=' + FROM + '&to=' + TO + '  (Authorization: Bearer con@otcr.test)', r.status, j, checks);
  }

  // 02 — pm1@otcr.test
  {
    const r = await call('GET', '/projects/schedule?from=' + FROM + '&to=' + TO, 'pm1@otcr.test');
    const j = r.json;
    const projects = (j && j.projects) || [];
    const harbor = projects.find((p) => p.id === 'p-harbor');
    const prairie = projects.find((p) => p.id === 'p-prairie');
    const checks = [
      [r.status === 200, 'status is 200'],
      [JSON.stringify(ids(j)) === JSON.stringify(['p-harbor', 'p-prairie']), 'project ids are ["p-harbor","p-prairie"]'],
      [!!harbor && harbor.canManage === true, 'p-harbor canManage === true'],
      [!!prairie && prairie.canManage === false, 'p-prairie canManage === false'],
      [has(j, 'd-h-draft'), 'd-h-draft visible'],
    ];
    await scene('02', 'pm1', 'PM 1 view', 'GET /projects/schedule?from=' + FROM + '&to=' + TO + '  (Authorization: Bearer pm1@otcr.test)', r.status, j, checks);
  }

  // 03 — pm2@otcr.test
  {
    const r = await call('GET', '/projects/schedule?from=' + FROM + '&to=' + TO, 'pm2@otcr.test');
    const j = r.json;
    const projects = (j && j.projects) || [];
    const orbit = projects.find((p) => p.id === 'p-orbit');
    const prairie = projects.find((p) => p.id === 'p-prairie');
    const checks = [
      [r.status === 200, 'status is 200'],
      [JSON.stringify(ids(j)) === JSON.stringify(['p-orbit', 'p-prairie']), 'project ids are ["p-orbit","p-prairie"]'],
      [!!orbit && orbit.canManage === true, 'p-orbit canManage === true'],
      [!!prairie && prairie.canManage === true, 'p-prairie canManage === true'],
      [!has(j, 'd-h-draft'), 'd-h-draft not visible'],
    ];
await scene('03', 'pm2', 'PM 2 view', 'GET /projects/schedule?from=' + FROM + '&to=' + TO + '  (Authorization: Bearer pm2@otcr.test)', r.status, j, checks);
  }

  // 04 — exec@otcr.test
  {
    const r4 = await call('GET', '/projects/schedule?from=' + FROM + '&to=' + TO, 'exec@otcr.test');
    const j4 = r4.json;
    const projects = (j4 && j4.projects) || [];
    const checks = [
      [r4.status === 200, 'status is 200'],
      [projects.length === 3, 'exactly 3 projects returned'],
      [projects.every((p) => p.canManage === false), 'all canManage === false'],
      [!has(j4, 'd-h-draft'), 'd-h-draft not visible'],
    ];
    await scene('04', 'exec', 'Executive view', 'GET /projects/schedule?from=' + FROM + '&to=' + TO + '  (Authorization: Bearer exec@otcr.test)', r4.status, j4, checks);
  }

  // 05 — admin@otcr.test
  {
    const r5 = await call('GET', '/projects/schedule?from=' + FROM + '&to=' + TO, 'admin@otcr.test');
    const j5 = r5.json;
    const projects = (j5 && j5.projects) || [];
    const deliverables = (j5 && j5.deliverables) || [];
    const checks = [
      [r5.status === 200, 'status is 200'],
      [projects.length === 3, 'exactly 3 projects returned'],
      [projects.every((p) => p.canManage === true), 'all canManage === true'],
      [has(j5, 'd-h-draft'), 'd-h-draft visible'],
      [deliverables.length === 5, 'deliverables length === 5'],
    ];
    await scene('05', 'admin', 'Admin view', 'GET /projects/schedule?from=' + FROM + '&to=' + TO + '  (Authorization: Bearer admin@otcr.test)', r5.status, j5, checks);
  }
  // 06 — Validation
  {
    const reqLine = 'GET /projects/schedule?from=not-a-date | from>to | 90d range | no auth';
    const badFrom = await call('GET', '/projects/schedule?from=not-a-date&to=' + encodeURIComponent(TO), 'admin@otcr.test');
    const inverted = await call('GET', '/projects/schedule?from=' + encodeURIComponent(TO) + '&to=' + encodeURIComponent(FROM), 'admin@otcr.test');
    const far = new Date(new Date(FROM).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const tooLong = await call('GET', '/projects/schedule?from=' + encodeURIComponent(FROM) + '&to=' + encodeURIComponent(far), 'admin@otcr.test');
    const noAuth = await call('GET', '/projects/schedule?from=' + encodeURIComponent(FROM) + '&to=' + encodeURIComponent(TO), null);

    const msgOf = (r) => {
      const j = r.json || {};
      return String(j.message || j.error || r.text || '').slice(0, 300);
    };
    const tooLongMsg = msgOf(tooLong);

    const checks = [
      [badFrom.status === 400, 'from=not-a-date -> 400 (got ' + badFrom.status + ')'],
      [inverted.status === 400, 'from>to -> 400 (got ' + inverted.status + ')'],
      [tooLong.status === 400, '90-day range -> 400 (got ' + tooLong.status + ')'],
      [tooLongMsg.includes('62 days'), '90-day range message includes "62 days" (got "' + tooLongMsg + '")'],
      [noAuth.status === 401 || noAuth.status === 403, 'no auth header -> 401/403 (got ' + noAuth.status + ')'],
    ];

    const jsonValue = {
      invalidFrom: { request: 'from=not-a-date', status: badFrom.status, message: msgOf(badFrom) },
      invertedRange: { request: 'from=TO&to=FROM', status: inverted.status, message: msgOf(inverted) },
      tooLongRange: { request: 'from=FROM&to=FROM+90d', status: tooLong.status, message: tooLongMsg },
      noAuth: { request: 'no Authorization header', status: noAuth.status, message: msgOf(noAuth) },
    };

    await scene(
      6,
      'validation',
      'Validation',
      reqLine,
      tooLong.status,
      jsonValue,
      checks
    );
  }

  // 07 — Server still enforces who can move a deadline
  {
    const reqLine = 'PATCH /deliverables/d-h-research/deadline (con -> pm1)';
    const NEW_DL = '2026-11-06T23:00:00.000Z';

    const conPatch = await call('PATCH', '/deliverables/d-h-research/deadline', 'con@otcr.test', { deadline: NEW_DL });
    const pm1Patch = await call('PATCH', '/deliverables/d-h-research/deadline', 'pm1@otcr.test', { deadline: NEW_DL });
    const after = await call('GET', '/projects/schedule?from=' + encodeURIComponent(FROM) + '&to=' + encodeURIComponent(TO), 'pm1@otcr.test');
    const h = ((after.json && after.json.deliverables) || []).find((d) => d.id === 'd-h-research');
    const afterDeadline = h ? h.deadline : null;

    const checks = [
      [conPatch.status === 403, 'con PATCH deadline -> 403 (got ' + conPatch.status + ')'],
      [pm1Patch.status === 200, 'pm1 PATCH deadline -> 200 (got ' + pm1Patch.status + ')'],
      [afterDeadline === NEW_DL, 'pm1 GET schedule d-h-research.deadline === ' + NEW_DL + ' (got ' + afterDeadline + ')'],
    ];

    const jsonValue = {
      patchByMember: { request: 'PATCH deadline (con@otcr.test)', status: conPatch.status },
      patchByPm: { request: 'PATCH deadline (pm1@otcr.test)', status: pm1Patch.status },
      deadlineAfter: { request: 'GET /projects/schedule d-h-research.deadline', deadline: afterDeadline, expected: NEW_DL },
    };

    await scene(
      7,
      'deadline-permission',
      'Server still enforces who can move a deadline',
      reqLine,
      pm1Patch.status,
      jsonValue,
      checks
    );
  }

  // 08 — Restore seed
  {
    const reqLine = 'PATCH /deliverables/d-h-research/deadline (restore seed)';
    const SEED_DL = '2026-11-04T23:00:00.000Z';

    const restore = await call('PATCH', '/deliverables/d-h-research/deadline', 'pm1@otcr.test', { deadline: SEED_DL });
    const after = await call('GET', '/projects/schedule?from=' + encodeURIComponent(FROM) + '&to=' + encodeURIComponent(TO), 'pm1@otcr.test');
    const h = ((after.json && after.json.deliverables) || []).find((d) => d.id === 'd-h-research');
    const afterDeadline = h ? h.deadline : null;

    const checks = [
      [restore.status === 200, 'pm1 restore deadline -> 200 (got ' + restore.status + ')'],
      [afterDeadline === SEED_DL, 'd-h-research.deadline restored to ' + SEED_DL + ' (got ' + afterDeadline + ')'],
    ];

    const jsonValue = {
      restore: { request: 'PATCH deadline (pm1@otcr.test)', status: restore.status, body: restore.json },
      deadlineAfter: { request: 'GET /projects/schedule d-h-research.deadline', deadline: afterDeadline, expected: SEED_DL },
    };

    await scene(8, 'restore-seed', 'Restore seed', reqLine, restore.status, jsonValue, checks);
  }

  // Summary scene
  {
    const rows = await page.evaluate((res) => {
      return res
        .map((r) => {
          const body = (r.checks || [])
            .map((c) => {
              const ok = c[0];
              const label = c[1];
              return (
                '<li class="' +
                (ok ? 'ok' : 'bad') +
                '">' +
                '<span class="tag">' +
                (ok ? 'PASS' : 'FAIL') +
                '</span> ' +
                String(label)
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;') +
                '</li>'
              );
            })
            .join('');
          return (
            '<section><h2>' +
            String(r.title)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;') +
            '</h2><ul>' +
            body +
            '</ul></section>'
          );
        })
        .join('');
    }, results);

    let totalPass = 0;
    let totalFail = 0;
    for (const r of results) {
      totalPass += r.pass;
      totalFail += r.fail;
    }

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#0b0f14;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:48px;box-sizing:border-box}
h1{font-size:28px;font-weight:600;margin:0 0 24px}
table{border-collapse:collapse;font-size:15px;min-width:640px}
th,td{padding:10px 18px;text-align:left;border-bottom:1px solid #1f2937}
th{color:#9ca3af;font-weight:500;text-transform:uppercase;font-size:12px;letter-spacing:.06em}
td.num{text-align:right;font-variant-numeric:tabular-nums}
td.pass{color:#34d399}
td.fail{color:#f87171}
.total{margin-top:28px;font-size:22px;font-weight:600;color:${totalFail === 0 ? '#34d399' : '#f87171'}}
.counts{color:#9ca3af;font-weight:400}
</style></head><body>
<h1>Batch schedule endpoint — QA summary</h1>
<table><thead><tr><th>Check</th><th style="text-align:right">PASS</th><th style="text-align:right">FAIL</th></tr></thead><tbody>
${results.map(r => `<tr><td>${r.title}</td><td class="num pass">${r.pass}</td><td class="num ${r.fail ? 'fail' : ''}">${r.fail}</td></tr>`).join('')}
</tbody></table>
<div class="total">PASS ${totalPass} · FAIL ${totalFail}</div>
</body></html>`;
await page.setContent(html);
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(outDir, '99-summary.png') });
const video = page.video();
await context.close();
fs.renameSync(await video.path(), path.join(outDir, 'schedule-endpoint-qa.webm'));
await browser.close();
console.log('failed checks: ' + totalFail);
process.exit(totalFail ? 1 : 0);
  }
})().catch(e => { console.error(e); process.exit(1); });
