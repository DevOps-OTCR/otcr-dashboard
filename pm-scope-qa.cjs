const fs = require('fs');
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd()] }));

const outDir = process.argv[2];
const BEFORE = 'http://localhost:4100';
const AFTER = 'http://localhost:4101';

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
  let anyFail = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function call(base, method, urlPath, email, body) {
    const res = await api.fetch(base + urlPath, {
      method,
      headers: email ? { Authorization: 'Bearer ' + email } : {},
      data: body,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    return { status: res.status(), json, text };
  }

  function names(r) {
    if (!r.json || !Array.isArray(r.json.projects)) return [];
    return r.json.projects.map((p) => p && p.name);
  }

  function eqList(a, b) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }

  async function scene(n, slug, title, requestLine, statusLine, jsonValue, checks, bugMode) {
    const pass = checks.filter((c) => c[0]).length;
    const fail = checks.length - pass;
    if (!bugMode && fail > 0) anyFail = true;
    results.push({ n, title, pass, fail, bugMode });

    const chips = checks
      .map((c) => '<div class="row"><span class="chip ' + (bugMode ? 'bug' : (c[0] ? 'ok' : 'bad')) + '">' + (bugMode ? 'BUG REPRODUCED' : (c[0] ? 'PASS' : 'FAIL')) + '</span> <span class="ctext">' + esc(c[1]) + '</span></div>')
      .join('');

    const html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
      'body{margin:0;background:#0b0d12;color:#e6e9ef;font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:28px}' +
      'h1{font-size:22px;margin:0 0 6px;color:#fff}' +
      'h2{font-size:26px;margin:26px 0 14px;color:#8ab4ff}' +
      '.panel{background:#11141c;border:1px solid #222a3a;border-radius:10px;padding:16px 18px;margin:14px 0}' +
      '.lbl{color:#8b93a7;font-size:12px;text-transform:uppercase;letter-spacing:.08em}' +
      '.val{margin:4px 0 12px;color:#e6e9ef;white-space:pre-wrap;word-break:break-word}' +
      '.chip{display:inline-block;padding:2px 9px;border-radius:999px;font-weight:700;font-size:12px}' +
      '.chip.ok{background:#123d24;color:#4ade80;border:1px solid #1f7a44}' +
      '.chip.bad{background:#43181c;color:#ff6b6b;border:1px solid #8a2b34}' +
      '.chip.bug{background:#3d2f10;color:#fbbf24;border:1px solid #8a6a1b}' +
      '.ctext{margin-left:8px;color:#cfd6e4}' +
      '.row{margin:6px 0}' +
      '</style></head><body>' +
      '<h1>' + esc('PM project scoping fix — real NestJS API + Postgres 16 (local)') + '</h1>' +
      '<div class="lbl">Scene ' + n + '</div>' +
      '<h2>' + esc(title) + '</h2>' +
      '<div class="panel"><div class="lbl">Request</div><div class="val">' + esc(requestLine) + '</div>' +
      '<div class="lbl">Response</div><div class="val">' + esc(statusLine) + '</div></div>' +
      '<div class="panel"><div class="lbl">Data</div><div class="val">' + esc(jsonValue) + '</div></div>' +
      '<div class="panel"><div class="lbl">Checks</div>' + chips + '</div>' +
      '</body></html>';

    await page.setContent(html);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(outDir, n + '-' + slug + '.png') });
  }

  // Scene 1: BEFORE (main) — documents the bug
  {
    const r = await call(BEFORE, 'GET', '/projects?pmId=u-pm2&limit=50', 'pm1@otcr.test');
    const ns = names(r);
    const leaked = ns.includes('Prairie Health Clinics') || ns.includes('Orbit Robotics');
    const checks = [[leaked, 'names include Prairie Health Clinics or Orbit Robotics (pm1 sees pm2 projects)']];
    await scene(1, 'before-pm-cross-listing', 'Before (main): a PM can list another PM\'s projects', 'pm1 GET ' + BEFORE + '/projects?pmId=u-pm2&limit=50', 'HTTP ' + r.status + ' — names: ' + JSON.stringify(ns), JSON.stringify(r.json, null, 2), checks, true);
  }

  // Scene 2: AFTER — pmId ignored for PMs
  {
    const r = await call(AFTER, 'GET', '/projects?pmId=u-pm2&limit=50', 'pm1@otcr.test');
    const ns = names(r);
    const checks = [
      [r.status === 200, 'status is 200 (got ' + r.status + ')'],
      [eqList(ns, ['Harbor Lane Coffee']), 'names exactly ["Harbor Lane Coffee"] (got ' + JSON.stringify(ns) + ')'],
    ];
    await scene(2, 'after-pmid-ignored', 'After (this PR): pmId is ignored for PMs', 'pm1 GET ' + AFTER + '/projects?pmId=u-pm2&limit=50', 'HTTP ' + r.status + ' — names: ' + JSON.stringify(ns), JSON.stringify(r.json, null, 2), checks, false);
  }

  // Scene 3: AFTER — normal listing unchanged
  {
    const r = await call(AFTER, 'GET', '/projects?limit=50', 'pm1@otcr.test');
    const ns = names(r);
    const checks = [[eqList(ns, ['Harbor Lane Coffee']), 'names ["Harbor Lane Coffee"] (got ' + JSON.stringify(ns) + ')']];
    await scene(3, 'after-normal-listing', 'After: normal PM listing unchanged', 'pm1 GET ' + AFTER + '/projects?limit=50', 'HTTP ' + r.status + ' — names: ' + JSON.stringify(ns), JSON.stringify(r.json, null, 2), checks, false);
  }

  // Scene 4: AFTER — admins can still filter by PM
  {
    const r = await call(AFTER, 'GET', '/projects?pmId=u-pm2&limit=50', 'admin@otcr.test');
    const ns = names(r).slice().sort();
    const checks = [[eqList(ns, ['Orbit Robotics', 'Prairie Health Clinics']), 'sorted names equal ["Orbit Robotics","Prairie Health Clinics"] (got ' + JSON.stringify(ns) + ')']];
    await scene(4, 'after-admin-filter', 'After: admins can still filter by PM', 'admin GET ' + AFTER + '/projects?pmId=u-pm2&limit=50', 'HTTP ' + r.status + ' — sorted names: ' + JSON.stringify(ns), JSON.stringify(r.json, null, 2), checks, false);
  }

  // Scene 5: AFTER — consultants only see their teams
  {
    const r = await call(AFTER, 'GET', '/projects?pmId=u-pm2&limit=50', 'con@otcr.test');
    const ns = names(r).slice().sort();
    const checks = [[eqList(ns, ['Harbor Lane Coffee', 'Prairie Health Clinics']), 'sorted names equal ["Harbor Lane Coffee","Prairie Health Clinics"] (got ' + JSON.stringify(ns) + ')']];
    await scene(5, 'after-consultant-teams', 'After: consultants only see their teams', 'con GET ' + AFTER + '/projects?pmId=u-pm2&limit=50', 'HTTP ' + r.status + ' — sorted names: ' + JSON.stringify(ns), JSON.stringify(r.json, null, 2), checks, false);
  }

  // Summary scene
  {
    const totalPass = results.reduce((s, r) => s + r.pass, 0);
    const totalFail = results.reduce((s, r) => s + r.fail, 0);
    const rows = results
      .map((r) => '<div class="row"><span class="chip ' + (r.bugMode ? 'bug' : (r.fail === 0 ? 'ok' : 'bad')) + '">' + (r.bugMode ? 'BUG' : (r.fail === 0 ? 'PASS' : 'FAIL')) + '</span> <span class="ctext">Scene ' + r.n + ' — ' + esc(r.title) + ' (' + r.pass + ' pass / ' + r.fail + ' fail)</span></div>')
      .join('');

    const html = '<!doctype html><html><head><meta charset="utf-8"><style>' +
      'body{margin:0;background:#0b0d12;color:#e6e9ef;font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:28px}' +
      'h1{font-size:22px;margin:0 0 6px;color:#fff}' +
      'h2{font-size:26px;margin:26px 0 14px;color:#8ab4ff}' +
      '.panel{background:#11141c;border:1px solid #222a3a;border-radius:10px;padding:16px 18px;margin:14px 0}' +
      '.lbl{color:#8b93a7;font-size:12px;text-transform:uppercase;letter-spacing:.08em}' +
      '.chip{display:inline-block;padding:2px 9px;border-radius:999px;font-weight:700;font-size:12px}' +
      '.chip.ok{background:#123d24;color:#4ade80;border:1px solid #1f7a44}' +
      '.chip.bad{background:#43181c;color:#ff6b6b;border:1px solid #8a2b34}' +
      '.chip.bug{background:#3d2f10;color:#fbbf24;border:1px solid #8a6a1b}' +
      '.ctext{margin-left:8px;color:#cfd6e4}' +
      '.row{margin:6px 0}' +
      '</style></head><body>' +
      '<h1>' + esc('PM project scoping fix — summary') + '</h1>' +
      '<h2>' + esc(totalFail === 0 ? 'All checks passed' : 'Checks failed') + '</h2>' +
      '<div class="panel"><div class="lbl">Totals</div><div class="row"><span class="chip ok">' + totalPass + ' pass</span> <span class="chip bad">' + totalFail + ' fail</span></div></div>' +
      '<div class="panel"><div class="lbl">Scenes</div>' + rows + '</div>' +
      '</body></html>';

    await page.setContent(html);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(outDir, '6-summary.png') });
  }

  const video = page.video();
  await context.close();
  if (video) {
    const vpath = await video.path();
    const dest = path.join(outDir, 'pm-scope-qa.webm');
    try { fs.renameSync(vpath, dest); } catch (e) { fs.copyFileSync(vpath, dest); }
  }
  await browser.close();

  process.exit(anyFail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
