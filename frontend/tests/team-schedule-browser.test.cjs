const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildBundle, buildStyles, document } = require('./navigation-browser/bundle.cjs');
const { responseFor } = require('./navigation-browser/fixtures.cjs');
let browser, bundle, styles;
before(async () => {
  bundle = await buildBundle({ outputName: 'team-schedule-test' });
  styles = await buildStyles();
  browser = await chromium.launch({ headless: true,
    ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}) });
});
after(() => browser?.close());

function mondayInfo() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 0, 0, 0, 0);
  const day = offset => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
  const iso = (dayOffset, hour) =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayOffset, hour, 0, 0, 0).toISOString();
  return { monday, day, iso };
}

async function setup(t) {
  const { day, iso } = mondayInfo();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  t.after(() => context.close());
  const errors = [];
  const patchCalls = [];
  let failNext = false;

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

  await context.route('**/api/**', route => {
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

  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));

  const col = i => page.locator('div.grid.grid-cols-7 > div').nth(i);

  await page.goto('http://navigation.test/overview');
  await page.addStyleTag({ content: styles });

  return { page, col, patchCalls, day, fail: () => { failNext = true; } };
}

test('Google Calendar stays the default and the Team schedule tab loads items', async t => {
  const { page } = await setup(t);
  await page.getByRole('tab', { name: 'Google Calendar' }).waitFor();
  assert.equal(await page.getByRole('tab', { name: 'Google Calendar' }).getAttribute('aria-selected'), 'true');

  await page.getByRole('tab', { name: 'Team schedule' }).click();
  const researchBtn = page.locator('button[aria-label^="Market sizing research"]').first();
  await researchBtn.waitFor();
  const memoBtn = page.locator('button[aria-label^="Pricing memo"]').first();
  await memoBtn.waitFor();

  assert.equal(await memoBtn.getAttribute('draggable'), 'false');
  assert.equal(await researchBtn.getAttribute('draggable'), 'true');
});

test('a PM drags a deadline to another day and it is saved at the same time of day', async t => {
  const { page, col, patchCalls, day } = await setup(t);
  await page.getByRole('tab', { name: 'Team schedule' }).click();
  const researchBtn = page.locator('button[aria-label^="Market sizing research"]').first();
  await researchBtn.waitFor();

  await researchBtn.dragTo(col(4));
  await page.getByRole('status').filter({ hasText: 'Moved Market sizing research' }).waitFor();

  assert.equal(patchCalls.length >= 1, true);
  assert.equal(patchCalls[0].id, 't1-research');
  const d = new Date(patchCalls[0].body.deadline);
  assert.equal(d.getDate(), day(4).getDate());
  assert.equal(d.getHours(), 17);
});

test('Alt+ArrowRight moves a deadline one day and keeps focus', async t => {
  const { page, patchCalls, day } = await setup(t);
  await page.getByRole('tab', { name: 'Team schedule' }).click();
  const deckBtn = page.locator('button[aria-label^="Client draft deck"]').first();
  await deckBtn.waitFor();

  await deckBtn.focus();
  await page.keyboard.press('Alt+ArrowRight');
  await page.getByRole('status').filter({ hasText: 'Moved Client draft deck' }).waitFor();

  const moveCall = patchCalls.find(call => call.id === 't1-deck');
  assert.ok(moveCall, 'expected a PATCH for t1-deck');
  const d = new Date(moveCall.body.deadline);
  assert.equal(d.getDate(), day(4).getDate());

  const activeLabel = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? el.getAttribute('aria-label') : null;
  });
  assert.ok(activeLabel && activeLabel.startsWith('Client draft deck'),
    `expected activeElement aria-label to start with 'Client draft deck', got ${activeLabel}`);
});

test('a rejected move shows an error and reverts', async t => {
  const { page, col, fail } = await setup(t);
  await page.getByRole('tab', { name: 'Team schedule' }).click();
  const researchBtn = page.locator('button[aria-label^="Market sizing research"]').first();
  await researchBtn.waitFor();

  fail();
  await researchBtn.dragTo(col(0));
  await page.getByRole('alert').filter({ hasText: 'Could not move Market sizing research: Only the project PM' }).waitFor();

  const stillIn2 = await col(2).locator('button[aria-label^="Market sizing research"]').count();
  assert.equal(stillIn2, 1);
});

test('switching back keeps the Google iframe mounted', async t => {
  const { page } = await setup(t);
  await page.getByRole('tab', { name: 'Google Calendar' }).waitFor();
  await page.locator('iframe').first().waitFor({ state: 'visible' });
  await page.evaluate(() => { window.__iframe = document.querySelector('iframe'); });

  await page.getByRole('tab', { name: 'Team schedule' }).click();
  await page.locator('button[aria-label^="Market sizing research"]').first().waitFor();
  await page.getByRole('tab', { name: 'Google Calendar' }).click();
  await page.locator('iframe').first().waitFor({ state: 'visible' });

  const sameIframe = await page.evaluate(() => window.__iframe === document.querySelector('iframe'));
  assert.equal(sameIframe, true);
});

test('month view shows the whole month and still saves a drag', async t => {
  const { page, col, patchCalls, day } = await setup(t);
  await page.getByRole('tab', { name: 'Team schedule' }).click();
  const viewBtn = page.getByRole('button', { name: 'Month', exact: true });
  await viewBtn.click();
  assert.equal(await viewBtn.getAttribute('aria-pressed'), 'true');

  const label = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  await page.getByText(label).first().waitFor();

  const cellCount = await page.locator('div.grid.grid-cols-7 > div').count();
  assert.ok(cellCount === 35 || cellCount === 42, `expected 35 or 42 cells, got ${cellCount}`);

  const first = day(0);
  const monthFirst = new Date(first.getFullYear(), first.getMonth(), 1, 12, 0, 0, 0);
  const gridStartDow = (monthFirst.getDay() + 6) % 7;
  const gridStart = new Date(monthFirst.getFullYear(), monthFirst.getMonth(), monthFirst.getDate() - gridStartDow, 12, 0, 0, 0);
  const target = day(4);
  const targetNoon = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 12, 0, 0, 0);
  const idx = Math.round((targetNoon - gridStart) / 86400000);

  const researchBtn = page.locator('button[aria-label^="Market sizing research"]').first();
  await researchBtn.waitFor();
  await researchBtn.dragTo(col(idx));
  await page.getByRole('status').filter({ hasText: 'Moved Market sizing research' }).waitFor();

  const moveCall = patchCalls.find(call => call.id === 't1-research');
  assert.ok(moveCall, 'expected a PATCH for t1-research');
  const d = new Date(moveCall.body.deadline);
  assert.equal(d.getDate(), target.getDate());
  assert.equal(d.getHours(), 17);
});
