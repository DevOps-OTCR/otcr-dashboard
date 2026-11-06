const fs = require('fs');
const path = require('path');
const H = path.join(process.cwd(), 'tests/navigation-browser');
const { buildBundle, buildStyles, document } = require(H + '/bundle.cjs');
const { responseFor } = require(H + '/fixtures.cjs');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd()] }));

const outDir = process.argv[2] || path.join(process.cwd(), 'demo-out');

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const errors = [];
  const bundle = await buildBundle({ outputName: 'team-schedule-qa' });
  const styles = await buildStyles();
  const browser = await chromium.launch({ headless: true, slowMo: 250 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
  });

  await context.route('http://navigation.test/**', route => {
    const url = route.request().url();
    const isBundle = url.endsWith('/bundle.js');
    return route.fulfill({
      contentType: isBundle ? 'text/javascript; charset=utf-8' : 'text/html',
      body: isBundle ? bundle : document,
    });
  });

  await context.route('https://calendar.google.com/**', route => {
    return route.fulfill({ contentType: 'text/html', body: '<p>Calendar</p>' });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message));

  const patchCalls = [];
  let failNext = false;

  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 0, 0, 0, 0);
  const day = offset => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
  const iso = (dayOffset, hour) =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayOffset, hour, 0, 0, 0).toISOString();

  const weekStartDate = iso(0, 0);
  const weekEndDate = iso(6, 0);
  const deliverables = {
    'team-1': [
      { id: 't1-research', title: 'Market sizing research', deadline: iso(2, 17), status: 'IN_PROGRESS', assignees: [], subtasks: [] },
      { id: 't1-deck', title: 'Client draft deck', deadline: iso(3, 21), status: 'IN_PROGRESS', assignees: [], subtasks: [] },
    ],
    'team-2': [
      { id: 't2-memo', title: 'Pricing memo', deadline: iso(1, 12), status: 'IN_PROGRESS', assignees: [], subtasks: [] },
    ],
  };

  await page.route('**/api/**', route => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname.slice(4);
    const method = req.method();

    if (pathname === '/auth/role') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'PM' }) });
    }

    if (pathname === '/projects') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        projects: [
          { id: 'team-1', name: 'Team One', googleCalendarId: 'team-1@example.test', pm: { email: 'pm@example.test' } },
          { id: 'team-2', name: 'Team Two', pm: { email: 'other.pm@example.test' } },
        ],
      }) });
    }

    const sprintMatch = pathname.match(/^\/projects\/([^/]+)\/sprints$/);
    if (sprintMatch) {
      const id = sprintMatch[1];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: `${id}-w`, label: 'Week 10', status: 'RELEASED', weekStartDate, weekEndDate, deliverables: deliverables[id] || [] },
      ]) });
    }

    if (pathname === '/attendance/events') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        events: [
          { id: 'ev-1', title: 'General body meeting', eventDate: iso(4, 19), projectId: null, projectName: null },
        ],
      }) });
    }

    const deadlineMatch = pathname.match(/^\/deliverables\/([^/]+)\/deadline$/);
    if (method === 'PATCH' && deadlineMatch) {
      const id = deadlineMatch[1];
      const body = req.postDataJSON();
      patchCalls.push({ id, body });
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 403, contentType: 'application/json',
          body: JSON.stringify({ message: 'Only the project PM, LC or admin can change this deadline.' }) });
      }
      for (const list of Object.values(deliverables)) {
        for (const d of list) {
          if (d.id === id) d.deadline = body.deadline;
        }
      }
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id, deadline: body.deadline }) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(responseFor(pathname, 'PM')) });
  });
  const col = i => page.locator('div.grid.grid-cols-7 > div').nth(i);

  // 1. Google Calendar tab
  await page.goto('http://navigation.test/overview');
  await page.addStyleTag({ content: styles });
  await page.getByRole('tab', { name: 'Google Calendar' }).waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '01-google-tab.png'), fullPage: false });
  console.log(JSON.stringify({ step: '01-google-tab', patchCalls: patchCalls.length }));

  // 2. Team schedule tab
  await page.getByRole('tab', { name: 'Team schedule' }).click();
  await page.locator('button[aria-label^="Market sizing research"]').first().waitFor();
  await page.getByRole('heading', { name: 'Team schedule' }).first().scrollIntoViewIfNeeded();
  await page.getByRole('heading', { name: 'Team schedule' }).first().evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '02-team-schedule.png'), fullPage: false });

  const researchBtn = page.locator('button[aria-label^="Market sizing research"]').first();
  const memoBtn = page.locator('button[aria-label^="Pricing memo"]').first();
  const memoDraggable = await memoBtn.getAttribute('draggable');
  if (memoDraggable !== 'false') errors.push(`Expected Team Two 'Pricing memo' draggable === 'false', got ${memoDraggable}`);
  const researchDraggable = await researchBtn.getAttribute('draggable');
  if (researchDraggable !== 'true') errors.push(`Expected Team One 'Market sizing research' draggable === 'true', got ${researchDraggable}`);
  console.log(JSON.stringify({ step: '02-team-schedule', patchCalls: patchCalls.length }));

  // 3. drag research to monday+4
  const target4 = (await page.locator('[data-day]').count()) ? page.locator('[data-day]').nth(4) : col(4);
  await researchBtn.dragTo(target4);
  await page.getByRole('status').filter({ hasText: 'Moved Market sizing research' }).waitFor();
  if (!patchCalls[0] || patchCalls[0].id !== 't1-research') {
    errors.push(`Expected patchCalls[0].id === 't1-research', got ${JSON.stringify(patchCalls[0])}`);
  } else {
    const d = new Date(patchCalls[0].body.deadline);
    if (d.getDate() !== day(4).getDate()) errors.push(`Expected research deadline day === ${day(4).getDate()}, got ${d.getDate()}`);
    if (d.getHours() !== 17) errors.push(`Expected research deadline hour === 17, got ${d.getHours()}`);
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '03-dragged.png'), fullPage: false });
  console.log(JSON.stringify({ step: '03-dragged', patchCalls: patchCalls.length }));

  // 4. keyboard move deck to monday+4
  const deckBtn = page.locator('button[aria-label^="Client draft deck"]').first();
  await deckBtn.focus();
  await page.keyboard.press('Alt+ArrowRight');
  await page.getByRole('status').filter({ hasText: 'Moved Client draft deck' }).waitFor();
  if (!patchCalls[1] || patchCalls[1].id !== 't1-deck') {
    errors.push(`Expected patchCalls[1].id === 't1-deck', got ${JSON.stringify(patchCalls[1])}`);
  } else {
    const d = new Date(patchCalls[1].body.deadline);
    if (d.getDate() !== day(4).getDate()) errors.push(`Expected deck deadline day === ${day(4).getDate()}, got ${d.getDate()}`);
  }
  const activeLabel = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? el.getAttribute('aria-label') : null;
  });
  if (!activeLabel || !activeLabel.startsWith('Client draft deck')) {
    errors.push(`Expected activeElement aria-label to start with 'Client draft deck', got ${activeLabel}`);
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '04-keyboard.png'), fullPage: false });
  console.log(JSON.stringify({ step: '04-keyboard', patchCalls: patchCalls.length }));

  // 5. server rejects - reverted
  failNext = true;
  const target0 = (await page.locator('[data-day]').count()) ? page.locator('[data-day]').nth(0) : col(0);
  await researchBtn.dragTo(target0);
  await page.getByRole('alert').filter({ hasText: 'Could not move Market sizing research: Only the project PM' }).waitFor();
  const stillIn4 = await col(4).locator('button[aria-label^="Market sizing research"]').count();
  if (stillIn4 !== 1) errors.push(`Expected research button to remain in column 4 (count 1), got ${stillIn4}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '05-rejected-reverted.png'), fullPage: false });
  console.log(JSON.stringify({ step: '05-rejected-reverted', patchCalls: patchCalls.length }));

  // 6. back to Google Calendar
  await page.getByRole('tab', { name: 'Google Calendar' }).click();
  await page.locator('iframe').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '06-back-to-google.png'), fullPage: false });
  console.log(JSON.stringify({ step: '06-back-to-google', patchCalls: patchCalls.length }));

  const video = page.video();
  await context.close();
  if (video) fs.renameSync(await video.path(), path.join(outDir, 'team-schedule-qa.webm'));
  await browser.close();
  if (errors.length) {
    console.error(errors);
    process.exit(1);
  }
  console.log('QA demo written to ' + outDir);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
