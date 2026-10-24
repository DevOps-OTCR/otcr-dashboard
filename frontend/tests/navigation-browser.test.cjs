const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildBundle, buildStyles, document } = require('./navigation-browser/bundle.cjs');
const { responseFor } = require('./navigation-browser/fixtures.cjs');
let browser, bundle, styles;

// Use Playwright's bundled Chromium unless a browser channel is explicitly selected.
before(async () => {
  bundle = await buildBundle();
  styles = await buildStyles();
  browser = await chromium.launch({
    ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}),
    headless: true,
  });
});
after(() => browser?.close());

async function setup(t, initialPath, role = 'PM') {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.route('https://calendar.google.com/**', route => {
    state.calendarLoads += 1;
    return route.fulfill({ contentType: 'text/html', body: '<p>Calendar fixture</p>' });
  });
  await context.route('http://navigation.test/**', route => route.fulfill({
    contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript; charset=utf-8' : 'text/html',
    body: route.request().url().endsWith('/bundle.js') ? bundle : document,
  }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  const state = { role, calls: [], gate: null, failSprints: false, slowGate: null, calendarLoads: 0, eventTitle: 'Team weekly check-in',
    alumniGate: null, failAlumni: false };
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname.slice(4);
    state.calls.push(pathname);
    if (state.slowGate && pathname === '/slow-test') await state.slowGate;
    if (state.gate && pathname !== '/auth/role' && pathname !== '/notifications/my') await state.gate;
    if (state.alumniGate && pathname === '/alumni') await state.alumniGate;
    if (pathname === '/test-write') state.eventTitle = 'Updated team check-in';
    const payload = responseFor(pathname, state.role);
    if (pathname === '/attendance/events') payload.events = payload.events.map(event => ({ ...event, title: state.eventTitle }));
    const failed = (state.failSprints && pathname.endsWith('/sprints')) || (state.failAlumni && pathname === '/alumni');
    await route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(failed ? { message: 'Temporary outage' } : payload) });
  });
  return { page, state,
    nav: label => page.locator('nav').getByRole('link', { name: label, exact: true }),
    open: () => page.goto('http://navigation.test' + initialPath),
  };
}

test('When2Meet creation errors remain inside the dialog and preserve entered values', async t => {
  const { page, open } = await setup(t, '/when2meet');
  await open();
  await page.getByRole('button', { name: 'New When2Meet', exact: true }).waitFor();
  await page.addStyleTag({ content: styles });
  await page.route('**/api/when2meet/polls', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Could not create test poll.' }),
  }));
  await page.getByRole('button', { name: 'New When2Meet', exact: true }).click();
  const form = page.locator('#when2meet-create-form');
  await form.getByPlaceholder('e.g. Sprint planning sync').fill('Planning test');
  await form.locator('input[type="date"]').nth(0).fill('2026-10-20');
  await form.locator('input[type="date"]').nth(1).fill('2026-10-21');
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  const error = form.getByRole('alert');
  await error.waitFor();
  assert.equal(await error.textContent(), 'Could not create test poll.');
  assert.equal(await error.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), true);
  assert.equal(await form.getByPlaceholder('e.g. Sprint planning sync').inputValue(), 'Planning test');
  assert.deepEqual(await form.locator('input[type="date"]').evaluateAll(inputs => inputs.map(input => input.value)),
    ['2026-10-20', '2026-10-21']);
});

test('Alumni restores table state, reuses fresh data, and retains rows during failed refreshes', async t => {
  const { page, state, nav, open } = await setup(t, '/alumni-database/');
  await open();
  await page.getByRole('searchbox').fill('Example');
  await page.getByRole('button', { name: 'Name', exact: true }).click();
  await page.getByRole('button', { name: 'Name', exact: true }).click();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  const rows = await page.locator('tbody').innerText();
  const assertTable = async () => {
    assert.equal(await page.getByRole('searchbox').inputValue(), 'Example');
    assert.equal(await page.getByRole('columnheader', { name: 'Name', exact: true }).getAttribute('aria-sort'), 'descending');
    assert.equal(await page.getByText('Page 2 of 3', { exact: true }).isVisible(), true);
    assert.equal(await page.locator('tbody').innerText(), rows);
  };
  await nav('Forms').click();
  await page.getByText('Dashboard Feedback Form', { exact: true }).waitFor();
  await nav('Alumni Database').click();
  await page.getByRole('searchbox').waitFor();
  assert.equal(await page.getByRole('button', { name: /Refresh alumni data/i }).count(), 0);
  await assertTable();
  assert.equal(state.calls.filter(path => path === '/alumni').length, 1);

  await nav('Forms').click();
  await page.clock.install({ time: new Date() });
  await page.clock.fastForward(121000);
  let release;
  state.alumniGate = new Promise(resolve => { release = resolve; });
  const refresh = page.waitForRequest('**/api/alumni');
  await nav('Alumni Database').click();
  await refresh;
  await assertTable();
  state.failAlumni = true;
  release();
  await page.getByRole('alert').waitFor();
  await assertTable();
  assert.equal(state.calls.filter(path => path === '/alumni').length, 2);

  state.failAlumni = false;
  state.alumniGate = new Promise(resolve => { release = resolve; });
  const retry = page.waitForRequest('**/api/alumni');
  await nav('Forms').click();
  await nav('Alumni Database').click();
  await retry;
  await page.evaluate(() => {
    window.alumniRequests = Promise.all([window.navigationTest.requestAlumni(), window.navigationTest.requestAlumni()]);
  });
  release();
  await page.evaluate(() => window.alumniRequests.then(() => true));
  await page.getByRole('alert').waitFor({ state: 'hidden' });
  await assertTable();
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(state.calls.filter(path => path === '/alumni').length, 3);
});

test('Alumni does not cache failed initial requests and retries on return', async t => {
  const { page, state, nav, open } = await setup(t, '/alumni-database');
  state.failAlumni = true;
  await open();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => window.navigationTest.readResource('/alumni')), undefined);
  state.failAlumni = false;
  await nav('Forms').click();
  await nav('Alumni Database').click();
  await page.getByRole('searchbox').waitFor();
  assert.equal(state.calls.filter(path => path === '/alumni').length, 2);
});

test('Alumni clears cached data and table state on account changes and sign-out', async t => {
  const { page, state, open } = await setup(t, '/alumni-database');
  await open();
  await page.getByRole('searchbox').fill('Example');
  const key = JSON.stringify(['alumni-database', 'pm@example.test', null]);
  let release;
  state.alumniGate = new Promise(resolve => { release = resolve; });
  const refresh = page.waitForRequest('**/api/alumni');
  await page.evaluate(() => window.navigationTest.switchAccount('other@example.test'));
  await refresh;
  assert.equal(await page.locator('tbody').count(), 0);
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), key), undefined);
  assert.equal(await page.evaluate(() => window.navigationTest.readResource('/alumni')), undefined);
  release();
  await page.getByRole('searchbox').waitFor();
  assert.equal(await page.getByRole('searchbox').inputValue(), '');
  const activeKey = JSON.stringify(['alumni-database', 'other@example.test', null]);
  await page.waitForFunction(key => Boolean(window.navigationTest.readSnapshot(key)), activeKey);
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await page.waitForURL('**/sign-in');
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), activeKey), undefined);
  assert.equal(await page.evaluate(() => window.navigationTest.readResource('/alumni')), undefined);
});

// Cover mobile, the two-column breakpoint, and the capped desktop card width.
for (const width of [375, 768, 1440]) {
  test(`subtask creation and editing stay inside the card at ${width}px`, async t => {
    const { page, open } = await setup(t, '/deliverables');
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/api/projects/*/sprints', route => {
      const payload = responseFor('/projects/team-1/sprints', 'PM');
      payload[0].deliverables[0].subtasks = [{ id: 'subtask-1', title: 'Existing subtask',
        assigneeId: 'u-1', dueDate: '2026-10-18T23:00:00Z', completed: false }];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await open();
    await page.getByRole('button', { name: 'Subtasks · 0/1 done', exact: true }).click();
    await page.getByLabel('Subtask title', { exact: true }).waitFor();
    await page.addStyleTag({ content: styles });
    await page.getByLabel('New subtask title', { exact: true }).fill('New subtask');
    for (const label of ['Subtask title', 'New subtask title']) {
      const form = page.getByLabel(label, { exact: true }).locator('..');
      const overflow = await form.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll('input, select, button')).filter(control => {
          const rect = control.getBoundingClientRect();
          return rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.width < 12;
        }).map(control => control.getAttribute('aria-label') || control.textContent);
      });
      assert.deepEqual(overflow, []);
    }
    for (const name of ['Add Subtask', 'Save', 'Delete']) {
      const button = page.getByRole('button', { name, exact: true });
      await button.focus();
      assert.equal(await button.evaluate(element => element === document.activeElement), true);
    }
  });
}

test('deliverable subtasks start collapsed, toggle independently, and keep unsaved input', async t => {
  const { page, open } = await setup(t, '/deliverables');
  await page.route('**/api/projects/*/sprints', route => {
    const payload = responseFor('/projects/team-1/sprints', 'PM');
    payload[0].deliverables.push({ id: 'team-1-analysis', title: 'team-1 Analysis', status: 'IN_PROGRESS',
      deadline: '2026-10-18T23:00:00Z', assignees: [], subtasks: [
        { id: 'subtask-1', title: 'Gather data', assigneeId: 'u-1', dueDate: null, completed: true },
        { id: 'subtask-2', title: 'Build model', assigneeId: null, dueDate: null, completed: false },
      ] });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await open();
  const toggles = page.getByRole('button', { name: /^Subtasks · \d+\/\d+ done$/ });
  await toggles.first().waitFor();
  assert.deepEqual(await toggles.allTextContents(), ['Subtasks · 0/0 done', 'Subtasks · 1/2 done']);
  for (const toggle of await toggles.all()) {
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    const panel = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
    assert.equal(await panel.isHidden(), true);
  }
  assert.equal(await page.getByText('No subtasks yet.').first().isVisible(), false);
  assert.equal(await page.getByLabel('New subtask title', { exact: true }).first().isVisible(), false);
  assert.equal(await page.getByLabel('Subtask title', { exact: true }).first().isVisible(), false);

  const [first, second] = await toggles.all();
  await first.focus();
  await page.keyboard.press('Enter');
  assert.equal(await first.getAttribute('aria-expanded'), 'true');
  assert.equal(await second.getAttribute('aria-expanded'), 'false');
  const firstPanel = page.locator(`[id="${await first.getAttribute('aria-controls')}"]`);
  await firstPanel.getByText('No subtasks yet.').waitFor();
  await firstPanel.getByLabel('New subtask title', { exact: true }).fill('Draft subtask');

  await first.focus();
  await page.keyboard.press('Space');
  assert.equal(await first.getAttribute('aria-expanded'), 'false');
  assert.equal(await firstPanel.isHidden(), true);
  await first.click();
  assert.equal(await firstPanel.getByLabel('New subtask title', { exact: true }).inputValue(), 'Draft subtask');
});

test('navigation stays usable during loading and Slides does not fetch twice', async t => {
  const { page, state, nav, open } = await setup(t, '/deliverables');
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await open();
  await page.getByRole('status').waitFor();
  await nav('Slides').click();
  await page.waitForURL('**/slides');
  assert.equal(await nav('Attendance').isVisible(), true);
  release();
  await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
  assert.equal(state.calls.filter(path => path === '/slide-submissions/all').length, 1);
  assert.equal(state.calls.includes('/slide-submissions/my'), false);
  assert.equal(state.calls.filter(path => path === '/projects/team-1/sprints').length, 1);
  await page.locator('main select').selectOption('team-2');
  await page.getByText('team-2 Draft deck', { exact: true }).waitFor();
  await page.evaluate(() => window.navigationTest.tokenProgress(true));
  assert.equal(await nav('Deliverables').isVisible(), true);
  assert.equal(await page.locator('main select').inputValue(), 'team-2');
  await page.evaluate(() => window.navigationTest.tokenProgress(false));
  assert.equal(state.calls.filter(path => path === '/slide-submissions/all').length, 1);
});

test('returning to a tab restores its project and content during a failed refresh', async t => {
  const { page, state, nav, open } = await setup(t, '/slides');
  await open();
  await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
  await page.locator('main select').selectOption('team-2');
  await page.getByText('team-2 Draft deck', { exact: true }).waitFor();
  await nav('Deliverables').click();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  let release;
  await page.clock.install({ time: new Date() });
  await page.clock.fastForward(121000);
  state.gate = new Promise(resolve => { release = resolve; });
  await nav('Slides').click();
  await page.getByText('team-2 Draft deck', { exact: true }).waitFor();
  assert.equal(await page.locator('main select').inputValue(), 'team-2');
  assert.equal(await page.getByRole('status').count(), 0);
  state.failSprints = true;
  release();
  await page.getByText('Failed to load slides. Please try again.', { exact: true }).waitFor();
  assert.equal(await page.getByText('team-2 Draft deck', { exact: true }).isVisible(), true);
});

test('Teams first visit keeps the navbar visible and return visits restore the selected team without requests', async t => {
  const { page, state, nav, open } = await setup(t, '/teams');
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await open();
  await page.getByText('Loading teams...', { exact: true }).waitFor();
  assert.equal(await nav('Attendance').isVisible(), true);
  release();
  await page.getByRole('button', { name: /Team Two/ }).click();
  await page.getByRole('heading', { name: 'Team Two', exact: true }).waitFor();
  await page.waitForFunction(() => window.navigationTest.readSnapshot(JSON.stringify(['teams', 'pm@example.test', null]))?.selectedTeamId === 'team-2');
  const requests = state.calls.length;
  await nav('Attendance').click();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  const afterAttendance = state.calls.length;
  await nav('Teams').click();
  assert.equal(await page.getByRole('heading', { name: 'Team Two', exact: true }).isVisible(), true);
  assert.equal(await page.getByText('Loading teams...', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Back to teams', exact: true }).waitFor();
  // Only the role and notification checks may run while cached team data is fresh.
  assert.deepEqual(state.calls.slice(afterAttendance).filter(path => path !== '/auth/role' && path !== '/notifications/my'), []);
  assert.ok(requests > 0);
});

test('Reminder overrides load saved recipients, retain failed edits, and reset to project defaults', async t => {
  const { page, open } = await setup(t, '/teams');
  let override = { enabled: true, offsetMinutes: [60], explicitRecipientUserIds: ['u-1'] };
  let failSave = false;
  const saves = [];
  await page.route('**/api/projects/deliverables/*/reminders/config', async route => {
    if (route.request().method() === 'PATCH') {
      const input = route.request().postDataJSON();
      saves.push(input);
      if (failSave) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary outage' }) });
      override = input;
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      enabled: override.enabled ?? true, offsetsMinutes: override.offsetMinutes.length ? override.offsetMinutes : [60],
      timezone: 'America/Chicago', override,
      eligibleRecipients: [{ userId: 'u-1', name: 'Test Consultant', email: 'consultant@example.test', slackConnected: false }],
    }) });
  });
  await open();
  await page.getByRole('button', { name: /Team One/ }).click();
  await page.getByRole('button', { name: 'team-1 Research', exact: true }).click();
  assert.equal(await page.getByLabel('Use project defaults').isChecked(), false);
  assert.equal(await page.getByRole('checkbox', { name: /Test Consultant/ }).isChecked(), true);
  await page.getByLabel('Add custom reminder (minutes before deadline)').fill('30');
  await page.getByLabel('Add custom reminder (minutes before deadline)').press('Enter');
  failSave = true;
  await page.getByRole('button', { name: 'Save override', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Your changes are still here' }).waitFor();
  assert.equal(await page.getByLabel('30 minutes before', { exact: true }).isChecked(), true);
  failSave = false;
  await page.getByRole('button', { name: 'Reset to inherit', exact: true }).click();
  const resetSaved = page.waitForResponse(response => response.url().includes('/reminders/config')
    && response.request().method() === 'PATCH' && response.status() === 200);
  await page.getByRole('button', { name: 'Save override', exact: true }).click();
  await resetSaved;
  await page.waitForFunction(() => !document.querySelector('fieldset[disabled]'));
  assert.deepEqual(saves.at(-1), { enabled: null, offsetMinutes: [], explicitRecipientUserIds: [] });
  assert.equal(await page.getByLabel('Use project defaults').isChecked(), true);
});

test('Deliverables and Client Notes keep restored content when an expired refresh fails', async t => {
  const { page, state, nav, open } = await setup(t, '/deliverables');
  let failNotes = false;
  await page.route(url => url.pathname === '/api/deliverables', route => route.fulfill({ status: failNotes ? 503 : 200,
    contentType: 'application/json', body: JSON.stringify(failNotes ? { message: 'Temporary outage' } : responseFor('/deliverables', 'PM')) }));
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await nav('Client Call Notes').click();
  await page.getByText('Client kickoff notes', { exact: true }).waitFor();
  await nav('Attendance').click();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  await page.clock.install({ time: new Date() });
  await page.clock.fastForward(121000);
  state.failSprints = true;
  failNotes = true;
  await nav('Deliverables').click();
  assert.equal(await page.getByText('team-1 Research', { exact: true }).isVisible(), true);
  await page.getByText('Temporary outage', { exact: true }).waitFor();
  assert.equal(await page.getByText('team-1 Research', { exact: true }).isVisible(), true);
  await nav('Client Call Notes').click();
  assert.equal(await page.getByText('Client kickoff notes', { exact: true }).isVisible(), true);
  await page.getByRole('alert').getByText('Could not refresh client notes. Showing previously loaded notes.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Client kickoff notes', { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('status').count(), 0);
});

test('Client Notes discards restored data after a confirmed role change, including a failed refresh', async t => {
  const { page, state, nav, open } = await setup(t, '/client-notes', 'ADMIN');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let failNotes = true;
  await page.route(url => url.pathname === '/api/deliverables', async route => {
    const admin = state.role === 'ADMIN';
    if (!admin) await gate;
    const notes = responseFor('/deliverables', state.role).map(note => ({
      ...note, title: admin ? 'Admin client note' : 'PM client note',
    }));
    await route.fulfill({ status: !admin && failNotes ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(!admin && failNotes ? { message: 'Temporary outage' } : notes) });
  });
  await page.route(url => url.pathname === '/api/projects', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ projects: responseFor('/projects', state.role).projects.slice(state.role === 'ADMIN' ? 0 : 1) }) }));
  await open();
  await page.getByRole('heading', { name: 'Admin client note', exact: true }).waitFor();
  await page.clock.install({ time: new Date() });
  await nav('Forms').click();
  await page.getByText('Dashboard Feedback Form', { exact: true }).waitFor();
  // Refresh the note cache just before the five-minute role cache expires.
  await page.clock.fastForward(271000);
  await nav('Client Call Notes').click();
  await page.waitForFunction(() => window.navigationTest.readResource('/deliverables?limit=200'));
  await nav('Forms').click();
  await page.getByText('Dashboard Feedback Form', { exact: true }).waitFor();
  await page.clock.fastForward(31000);
  state.role = 'PM';
  const refresh = page.waitForRequest(request => new URL(request.url()).pathname === '/api/deliverables');
  await nav('Client Call Notes').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('otcr_role_cache:pm@example.test')).role === 'PM');
  await refresh;
  assert.equal(await page.getByRole('heading', { name: 'Admin client note', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.navigationTest.readSnapshot(JSON.stringify(['client-notes', 'pm@example.test', null]))), undefined);
  release();
  await page.getByRole('alert').getByText('Could not load client notes.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Admin client note', exact: true }).count(), 0);
  assert.equal(await page.locator('main select option').filter({ hasText: 'Team One' }).count(), 0);
  failNotes = false;
  await page.getByRole('button', { name: 'Refresh page data', exact: true }).click();
  await page.getByRole('heading', { name: 'PM client note', exact: true }).waitFor();
  await page.waitForFunction(() => window.navigationTest.readSnapshot(JSON.stringify(['client-notes', 'pm@example.test', null]))?.notes[0]?.title === 'PM client note');
});

test('navbar refresh bypasses fresh cached data while restored content stays visible', async t => {
  const { page, state, open } = await setup(t, '/alumni-database');
  await open();
  await page.getByRole('searchbox').fill('Example');
  const rows = await page.locator('tbody').innerText();
  let release;
  state.alumniGate = new Promise(resolve => { release = resolve; });
  const refresh = page.waitForRequest('**/api/alumni');
  await page.getByRole('button', { name: 'Refresh page data', exact: true }).click();
  await refresh;
  assert.equal(await page.getByRole('searchbox').inputValue(), 'Example');
  assert.equal(await page.locator('tbody').innerText(), rows);
  assert.equal(await page.getByRole('status').count(), 0);
  release();
  await page.waitForFunction(() => window.navigationTest.readResource('/alumni'));
  assert.equal(state.calls.filter(path => path === '/alumni').length, 2);
  assert.equal(await page.getByRole('searchbox').inputValue(), 'Example');
});

test('writes invalidate other tabs and logout clears cached data', async t => {
  const { page, state, nav, open } = await setup(t, '/attendance');
  await open();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  await nav('Slides').click();
  await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
  let releaseSlow;
  state.slowGate = new Promise(resolve => { releaseSlow = resolve; });
  const slowRequest = page.waitForRequest('**/api/slow-test');
  await page.evaluate(() => { window.pendingResource = Promise.all([window.navigationTest.request(), window.navigationTest.request()]); });
  // Ensure the shared request is in flight before the write invalidates it.
  await slowRequest;
  await page.evaluate(() => window.navigationTest.write().then(() => true));
  releaseSlow();
  await page.evaluate(() => window.pendingResource.then(() => true));
  assert.equal(state.calls.filter(path => path === '/slow-test').length, 1);
  assert.equal(await page.evaluate(() => window.navigationTest.readResource('/slow-test')), undefined);
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await nav('Attendance').click();
  await page.getByRole('status').waitFor();
  assert.equal(await page.getByText('Team weekly check-in', { exact: true }).count(), 0);
  assert.equal(await nav('Slides').isVisible(), true);
  release();
  await page.getByText('Updated team check-in', { exact: true }).waitFor();
  const key = JSON.stringify(['attendance', 'pm@example.test', null]);
  await page.waitForFunction(key => Boolean(window.navigationTest.readSnapshot(key)), key);
  assert.ok(await page.evaluate(() => window.navigationTest.readResource('/attendance/events')));
  // Hold the new account's refresh so it cannot refill the cache before this check.
  let releaseAccountRefresh;
  state.gate = new Promise(resolve => { releaseAccountRefresh = resolve; });
  const accountRefresh = page.waitForRequest('**/api/attendance/events');
  await page.evaluate(() => window.navigationTest.switchAccount('other@example.test'));
  await accountRefresh;
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), key), undefined);
  assert.equal(await page.evaluate(() => window.navigationTest.readResource('/attendance/events')), undefined);
  const activeKey = JSON.stringify(['attendance', 'other@example.test', null]);
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), activeKey), undefined);
  releaseAccountRefresh();
  await page.getByText('Updated team check-in', { exact: true }).waitFor();
  await page.waitForFunction(key => Boolean(window.navigationTest.readSnapshot(key)), activeKey);
  assert.ok(await page.evaluate(() => window.navigationTest.readResource('/attendance/events')));
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await page.getByText('Updated team check-in', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), activeKey), undefined);
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), key), undefined);
  assert.equal(await page.evaluate(() => window.navigationTest.readResource('/attendance/events')), undefined);
});


test('managers create drafts with separate multi-person assignment sets', async t => {
  const { page, open } = await setup(t, '/workstream');
  await page.route('**/api/projects/team-1?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    pm: { id: 'u-1', firstName: 'Test PM' }, members: [{ user: { id: 'u-2', firstName: 'Casey' } }],
  }) }));
  const creations = [];
  await page.route('**/api/deliverables', route => {
    creations.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await open();
  await page.getByPlaceholder('- Add week function\n- Get it hosted\n- Redesign deliverables').fill('- Shared work\n- Unassigned work');
  const shared = page.getByRole('group', { name: 'Assignees for Shared work', exact: true });
  await shared.getByRole('checkbox', { name: 'Test PM', exact: true }).check();
  await shared.getByRole('checkbox', { name: 'Casey', exact: true }).check();
  await page.getByRole('button', { name: 'Save Deliverables', exact: true }).click();
  await page.getByText('Draft deliverables saved', { exact: true }).waitFor();
  assert.deepEqual(creations.map(item => [item.title, item.assigneeIds]), [['Shared work', ['u-1', 'u-2']], ['Unassigned work', []]]);
});

test('draft assignments survive title edits, inserts, moves, and deletions', async t => {
  const { page, open } = await setup(t, '/workstream');
  await page.route('**/api/projects/team-1?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    pm: { id: 'u-1', firstName: 'Test PM' }, members: [{ user: { id: 'u-2', firstName: 'Casey' } }],
  }) }));
  const creations = [];
  await page.route('**/api/deliverables', route => {
    creations.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await open();
  const input = page.getByPlaceholder('- Add week function\n- Get it hosted\n- Redesign deliverables');
  const group = title => page.getByRole('group', { name: `Assignees for ${title}`, exact: true });
  await input.fill('- Research\n- Slides');
  await group('Research').getByRole('checkbox', { name: 'Test PM', exact: true }).check();
  await group('Slides').getByRole('checkbox', { name: 'Casey', exact: true }).check();
  await input.fill('- Research\n- Slides\n- New task');
  assert.equal(await group('Research').getByRole('checkbox', { name: 'Test PM', exact: true }).isChecked(), true);
  await input.fill('- Research revised\n- Slides\n- New task');
  assert.equal(await group('Research revised').getByRole('checkbox', { name: 'Test PM', exact: true }).isChecked(), true);
  await input.fill('- New task\n- Slides\n- Research revised');
  assert.equal(await group('Slides').getByRole('checkbox', { name: 'Casey', exact: true }).isChecked(), true);
  await input.fill('- New task\n- Research revised');
  assert.equal(await group('New task').getByRole('checkbox', { name: 'Casey', exact: true }).isChecked(), false);
  await page.getByRole('button', { name: 'Save Deliverables', exact: true }).click();
  await page.getByText('Draft deliverables saved', { exact: true }).waitFor();
  assert.deepEqual(creations.map(item => [item.title, item.assigneeIds]), [['New task', []], ['Research revised', ['u-1']]]);
});

for (const initialFailure of [true, false]) {
  test(`member lookup failure is visible and retryable on ${initialFailure ? 'initial load' : 'project change'}`, async t => {
    const { page, open } = await setup(t, '/workstream');
    const target = initialFailure ? 'team-1' : 'team-2';
    let fail = true;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(`**/api/projects/${target}?*`, async route => {
      if (!fail) await gate;
      return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail
        ? { message: 'Member lookup failed' }
        : { pm: { id: 'u-1', firstName: 'Test PM' }, members: [] }) });
    });
    await open();
    if (!initialFailure) {
      await page.getByText('team-1 Research', { exact: true }).waitFor();
      await page.locator('main select').first().selectOption(target);
    }
    await page.getByRole('alert').getByText('Could not load team members.', { exact: true }).waitFor();
    await page.getByPlaceholder('- Add week function\n- Get it hosted\n- Redesign deliverables').fill('- Research');
    const save = page.getByRole('button', { name: 'Save Deliverables', exact: true });
    assert.equal(await save.isDisabled(), true);
    assert.equal(await page.getByText('No eligible team members.', { exact: true }).count(), 0);
    fail = false;
    await page.getByRole('button', { name: 'Retry team members', exact: true }).click();
    await page.getByRole('status').getByText('Loading team members...', { exact: true }).waitFor();
    assert.equal(await save.isDisabled(), true);
    release();
    await page.getByRole('checkbox', { name: 'Test PM', exact: true }).waitFor();
    assert.equal(await save.isEnabled(), true);
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.getByRole('checkbox', { name: 'Test PM', exact: true }).check();
  });
}

test('member responses from a previous project do not replace the current team', async t => {
  const { page, open } = await setup(t, '/workstream');
  let release, started;
  let attempts = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const requestStarted = new Promise(resolve => { started = resolve; });
  await page.route('**/api/projects/team-2?*', async route => {
    if (attempts++ === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    started();
    await gate;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      pm: { id: 'u-2', firstName: 'Wrong team' }, members: [],
    }) });
  });
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await page.locator('main select').first().selectOption('team-2');
  await page.getByRole('button', { name: 'Retry team members', exact: true }).click();
  await requestStarted;
  await page.locator('main select').first().selectOption('team-1');
  await page.getByPlaceholder('- Add week function\n- Get it hosted\n- Redesign deliverables').fill('- Research');
  await page.getByRole('checkbox', { name: 'Test', exact: true }).waitFor();
  const response = page.waitForResponse('**/api/projects/team-2?*');
  release();
  await response;
  assert.equal(await page.getByRole('checkbox', { name: 'Wrong team', exact: true }).count(), 0);
  assert.equal(await page.getByRole('checkbox', { name: 'Test', exact: true }).isVisible(), true);
});

test('assignment editor preselects everyone, saves a complete set, and retains selections after failure', async t => {
  const { page, open } = await setup(t, '/deliverables');
  const users = [{ id: 'u-1', firstName: 'Test PM' }, { id: 'u-2', firstName: 'Casey' }, { id: 'u-3', firstName: 'Riley' }];
  await page.route('**/api/projects/team-1?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    pm: users[0], members: users.slice(1).map(user => ({ user })),
  }) }));
  await page.route('**/api/projects/*/sprints', route => {
    const payload = responseFor('/projects/team-1/sprints', 'PM');
    payload[0].deliverables[0].assignees = users.slice(0, 2);
    payload[0].deliverables[0].submissions = [{ id: 's-1', fileUrl: 'https://example.test/submission', submittedAt: '2026-10-12', submitter: users[0] }];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
  const saves = [];
  let fail = false;
  await page.route('**/api/deliverables/*/assignments', route => {
    const ids = route.request().postDataJSON().assigneeIds;
    saves.push(ids);
    return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(fail ? { message: 'Save failed; try again' } : users.filter(user => ids.includes(user.id))) });
  });
  await open();
  const group = page.getByRole('group', { name: 'Assignees', exact: true });
  assert.equal(await group.getByRole('checkbox', { name: 'Test PM' }).isChecked(), true);
  assert.equal(await group.getByRole('checkbox', { name: 'Casey' }).isChecked(), true);
  await group.getByRole('checkbox', { name: 'Test PM' }).uncheck();
  await group.getByRole('checkbox', { name: 'Riley' }).check();
  await page.getByRole('button', { name: 'Save assignees', exact: true }).click();
  await page.getByText('Assignees saved', { exact: true }).waitFor();
  assert.deepEqual(saves, [['u-2', 'u-3']]);
  assert.equal(await page.getByText('Casey, Riley', { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('link', { name: /submission/i }).count() > 0, true);
  fail = true;
  await group.getByRole('checkbox', { name: 'Casey' }).uncheck();
  await page.getByRole('button', { name: 'Save assignees', exact: true }).click();
  await page.getByText('Save failed; try again', { exact: true }).waitFor();
  assert.equal(await group.getByRole('checkbox', { name: 'Casey' }).isChecked(), false);
  assert.equal(await page.getByText('Casey, Riley', { exact: true }).isVisible(), true);
  fail = false;
  await group.getByRole('checkbox', { name: 'Riley' }).uncheck();
  await page.getByRole('button', { name: 'Save assignees', exact: true }).click();
  await page.getByText('Unassigned', { exact: true }).first().waitFor();
  assert.deepEqual(saves.at(-1), []);
});


test('Workstream and W2M restore selected content while expired resources refresh', async t => {
  const { page, state, nav, open } = await setup(t, '/workstream');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await page.locator('main select').first().selectOption('team-2');
  await page.getByText('team-2 Research', { exact: true }).waitFor();
  await nav('When2Meet').click();
  await page.getByText('Monday', { exact: true }).first().waitFor();
  await nav('Attendance').click();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  await page.clock.install({ time: new Date() });
  await page.clock.fastForward(121000);
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await nav('Workstream').click();
  await page.getByText('team-2 Research', { exact: true }).waitFor();
  assert.equal(await page.locator('main select').first().inputValue(), 'team-2');
  assert.equal(await page.getByText('Loading page...', { exact: true }).count(), 0);
  await page.getByRole('status').getByText('Loading team members...', { exact: true }).waitFor();
  await nav('When2Meet').click();
  await page.getByText('Monday', { exact: true }).first().waitFor();
  assert.equal(await page.locator('main select').nth(1).inputValue(), 'poll-1');
  assert.equal(await page.getByRole('status').count(), 0);
  release();
});

test('Overview shares sprint requests and retains the calendar across routes and failed refreshes', async t => {
  const { page, state, nav, open } = await setup(t, '/overview');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  const iframe = page.locator('iframe');
  await iframe.waitFor();
  await page.evaluate(() => { window.originalCalendar = document.querySelector('iframe'); window.originalNavbar = document.querySelector('nav'); });
  await page.waitForFunction(() => Boolean(document.querySelector('iframe')?.contentWindow));
  const calendarUrl = await iframe.getAttribute('src');
  assert.ok(calendarUrl.includes('team-1%40example.test'));
  await nav('Workstream').click();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  assert.equal(await iframe.isVisible(), false);
  assert.equal(state.calls.filter(path => path === '/projects/team-1/sprints').length, 1);
  await page.clock.install({ time: new Date() });
  await page.clock.fastForward(121000);
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await nav('Overview').click();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  assert.equal(await page.getByRole('status').count(), 0);
  assert.equal(await page.evaluate(() => document.querySelector('iframe') === window.originalCalendar && document.querySelector('nav') === window.originalNavbar), true);
  assert.equal(await iframe.getAttribute('src'), calendarUrl);
  state.failSprints = true;
  release();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByText('team-1 Research', { exact: true }).isVisible(), true);
  state.gate = null;
  state.failSprints = false;
  await page.evaluate(() => window.navigationTest.navigate('/consultant'));
  await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
  assert.equal(await iframe.isVisible(), true);
  assert.equal(await page.evaluate(() => document.querySelector('iframe') === window.originalCalendar), true);
  assert.equal(state.calendarLoads, 1);
});

test('legacy role overview URLs redirect to the canonical Overview', async t => {
  const { page, nav, open } = await setup(t, '/pm');
  await open();
  await page.waitForURL('**/overview');
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await page.evaluate(() => { window.originalCalendar = document.querySelector('iframe'); });
  for (const path of ['/lc', '/partner/', '/pm/']) {
    await page.evaluate(path => window.navigationTest.navigate(path), path);
    await page.waitForURL('**/overview');
    await page.getByText('team-1 Research', { exact: true }).waitFor();
    assert.match(await nav('Overview').getAttribute('class'), /text-\[var\(--primary\)\]/);
    assert.equal(await page.evaluate(() => document.querySelector('iframe') === window.originalCalendar), true);
  }
  assert.equal(await nav('Overview').getAttribute('href'), '/overview');
});

test('Pages trailing-slash routes keep the navbar and overview calendar', async t => {
  const { page, nav, open } = await setup(t, '/overview/');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  assert.equal(await nav('Workstream').isVisible(), true);
  assert.equal(await page.locator('iframe').isVisible(), true);
  await page.evaluate(() => window.navigationTest.navigate('/when2meet/'));
  await page.getByText('Monday', { exact: true }).first().waitFor();
  assert.equal(await nav('When2Meet').isVisible(), true);
  assert.match(await nav('When2Meet').getAttribute('class'), /text-\[var\(--primary\)\]/);
});

test('Light/Dark toggle persists and syncs without replacing icons or reloading the calendar', async t => {
  const { page, state, open } = await setup(t, '/overview');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await page.locator('iframe').waitFor();
  await page.evaluate(() => {
    window.themeIcons = Array.from(document.querySelector('button[aria-label="Switch to dark mode"]').querySelectorAll('svg'));
    window.themeCalendar = document.querySelector('iframe');
  });
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  assert.equal(await page.getByRole('button', { name: 'Switch to light mode', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('menu').count(), 0);
  assert.equal(await page.evaluate(() => {
    const icons = document.querySelector('button[aria-label="Switch to light mode"]').querySelectorAll('svg');
    return icons.length === 2 && Array.from(icons).every((icon, index) => icon === window.themeIcons[index])
      && document.querySelector('iframe') === window.themeCalendar;
  }), true);
  assert.equal(state.calendarLoads, 1);

  await page.reload();
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);

  const other = await page.context().newPage();
  await other.route('**/api/**', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify(responseFor(new URL(route.request().url()).pathname.slice(4), 'PM')) }));
  await other.goto('http://navigation.test/slides');
  await other.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('light'));

  // Reads can succeed while writes fail when browser storage is full.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  assert.equal(await page.getByRole('button', { name: 'Switch to light mode', exact: true }).isVisible(), true);
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`theme colors change together without intermediate low contrast (${reducedMotion})`, async t => {
    const { page, open } = await setup(t, '/when2meet');
    await page.emulateMedia({ reducedMotion });
    await open();
    await page.getByText('Monday', { exact: true }).first().waitFor();
    await page.addStyleTag({ content: styles });
    // Cover generated content as well as the real navbar and W2M transitions.
    await page.addStyleTag({ content: 'nav::before { content: ""; color: var(--foreground); background: var(--card); border: 1px solid var(--border); transition: all 0.5s; }' });
    await page.evaluate(() => {
      const targets = [document.body, document.querySelector('header'), document.querySelector('nav'),
        ...document.querySelectorAll('nav a'), document.querySelector('.w2mRoot p'), document.querySelector('.w2m-square')];
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      function rgb(color) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      }
      function blend(front, back) {
        const alpha = front[3] / 255;
        return front.slice(0, 3).map((value, i) => value * alpha + back[i] * (1 - alpha));
      }
      function background(element) {
        if (!element) return [255, 255, 255];
        return blend(rgb(getComputedStyle(element).backgroundColor), background(element.parentElement));
      }
      function luminance(color) {
        return color.map(value => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
      }
      window.sampleTheme = () => {
        const colors = targets.map(element => {
          const style = getComputedStyle(element);
          return [style.color, style.backgroundColor, style.borderTopColor];
        });
        const pseudo = getComputedStyle(document.querySelector('nav'), '::before');
        colors.push([pseudo.color, pseudo.backgroundColor, pseudo.borderTopColor]);
        const contrast = targets.slice(0, -1).map(element => {
          const bg = background(element);
          const fg = blend(rgb(getComputedStyle(element).color), bg);
          const a = luminance(fg), b = luminance(bg);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
        return { colors, contrast };
      };
    });

    for (const theme of ['dark', 'light']) {
      const samples = await page.evaluate(async theme => {
        document.querySelector(`button[aria-label="Switch to ${theme} mode"]`).click();
        const samples = [window.sampleTheme()];
        for (let frame = 0; frame < 35; frame++) {
          await new Promise(requestAnimationFrame);
          samples.push(window.sampleTheme());
        }
        return samples;
      }, theme);
      const final = samples.at(-1);
      for (const sample of samples) {
        assert.deepEqual(sample.colors, final.colors, `${theme} colors must match the final palette on every frame`);
        assert.ok(sample.contrast.every(ratio => ratio >= 4.5), `Text contrast must stay at least 4.5:1: ${sample.contrast}`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('theme-changing')), false);
      assert.notEqual(await page.locator('nav a').first().evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    }

    // A second tab's storage event uses the same atomic update path.
    const synced = await page.evaluate(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
      return window.sampleTheme();
    });
    const rapid = await page.evaluate(() => {
      for (let i = 0; i < 4; i++) document.querySelector('button[aria-label^="Switch to"]').click();
      return window.sampleTheme();
    });
    assert.deepEqual(rapid.colors, synced.colors);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('theme-changing')), false);
  });
}

test('navbar sign-out clears dashboard credentials and profile state', async t => {
  const { page, open } = await setup(t, '/pm');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await page.evaluate(() => sessionStorage.setItem('otcr_profile_sync_fingerprint', 'cached-profile'));
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in with NetID', exact: true }).waitFor();
  assert.equal(await page.locator('nav').count(), 0);
  assert.equal(await page.evaluate(() => window.navigationTest.authHeader()), undefined);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('otcr_profile_sync_fingerprint')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('otcr_role_cache:pm@example.test')), null);
});

test('pending authentication and profile sync cannot restore a signed-out session', async t => {
  const { page, state, open } = await setup(t, '/pm?authSync=1');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await page.waitForFunction(() => Boolean(sessionStorage.getItem('otcr_profile_sync_fingerprint')));
  await page.evaluate(() => {
    window.navigationTest.instance.acquireTokenSilent = () => new Promise(resolve => {
      (window.finishOldTokenRequests ??= []).push(resolve);
    });
    window.oldToken = window.navigationTest.getToken().catch(error => error.name);
    window.navigationTest.instance.getActiveAccount().name = 'Updated profile';
    window.navigationTest.tokenProgress(true);
  });
  await page.evaluate(() => window.navigationTest.tokenProgress(false));
  await page.waitForFunction(() => window.finishOldTokenRequests?.length >= 2);
  const pendingTokens = await page.evaluate(() => window.finishOldTokenRequests.length);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(count => window.finishOldTokenRequests.length > count, pendingTokens);
  await page.evaluate(() => {
    window.navigationTest.instance.handleRedirectPromise = () => new Promise(resolve => {
      window.finishOldAuthCheck = resolve;
    });
    window.navigationTest.tokenProgress(true);
  });
  await page.evaluate(() => window.navigationTest.tokenProgress(false));
  await page.waitForFunction(() => Boolean(window.finishOldAuthCheck));
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in with NetID', exact: true }).waitFor();
  const notificationRequests = state.calls.filter(path => path === '/notifications/my').length;
  const token = await page.evaluate(async () => {
    window.finishOldAuthCheck({ account: { username: 'pm@example.test' } });
    for (const resolve of window.finishOldTokenRequests) resolve({ accessToken: 'stale-token' });
    const token = await window.oldToken;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return token;
  });
  assert.equal(token, 'AbortError');
  assert.equal(await page.getByRole('button', { name: 'Sign in with NetID', exact: true }).isVisible(), true);
  assert.equal(await page.locator('nav').count(), 0);
  assert.equal(await page.evaluate(() => window.navigationTest.authHeader()), undefined);
  assert.equal(state.calls.filter(path => path === '/notifications/my').length, notificationRequests);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('otcr_profile_sync_fingerprint')), null);
});

test('a Consultant page token request finishing after sign-out cannot send API requests', async t => {
  const { page, state, open } = await setup(t, '/deliverables');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await page.evaluate(() => {
    window.navigationTest.instance.acquireTokenSilent = () => new Promise(resolve => {
      (window.finishPageTokens ??= []).push(resolve);
    });
    window.navigationTest.navigate('/consultant');
  });
  await page.waitForFunction(() => window.finishPageTokens?.length > 0);
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in with NetID', exact: true }).waitFor();
  const requests = state.calls.length;
  await page.evaluate(async () => {
    window.finishPageTokens.forEach(resolve => resolve({ accessToken: 'stale-token' }));
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  assert.equal(await page.evaluate(() => window.navigationTest.authHeader()), undefined);
  assert.equal(state.calls.length, requests);
});

for (const role of ['CONSULTANT', 'LC', 'PM', 'PARTNER', 'EXECUTIVE']) {
  test(`People navigation and route deny ${role}`, async t => {
    const { page, state, nav, open } = await setup(t, '/people', role);
    await open();
    await page.getByText('Only administrators can access People.', { exact: true }).waitFor();
    assert.equal(await nav('People').count(), 0);
    assert.equal(await page.locator('nav').getByText('People', { exact: true }).count(), 0);
    assert.equal(state.calls.some(path => path === '/people' || path === '/onboarding/requests'), false);
  });
}

async function peopleSetup(t, options = {}) {
  const fixture = await setup(t, '/people', 'ADMIN');
  const { page } = fixture;
  const people = [{ id: 'casey', firstName: 'Casey', lastName: 'Test', email: 'casey@example.test', role: 'CONSULTANT', active: true,
    teams: [{ id: 'team-1', name: 'Team One', manages: false }] },
  { id: 'riley', firstName: 'Riley', lastName: 'Test', email: 'riley@example.test', role: 'PM', active: false, teams: [] }];
  const requests = [{ id: 'request', name: 'Alex Applicant', email: 'alex@example.test', requestedRole: 'CONSULTANT', grantedRole: null,
    status: 'PENDING', createdAt: '2026-10-12T12:00:00Z', reviewedAt: null, reviewerNotes: null }];
  const writes = [];
  let failWrites = false;
  await page.route('**/api/people**', async route => {
    if (options.gate) await options.gate;
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON(); writes.push(payload);
      if (!failWrites) people[0].role = payload.role;
      return route.fulfill({ status: failWrites ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failWrites ? { message: 'Role update failed' } : people[0]) });
    }
    return route.fulfill({ status: options.fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(options.fail
      ? { message: 'Directory unavailable' } : { people: options.empty ? [] : people }) });
  });
  await page.route('**/api/onboarding/requests**', route => {
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON(); writes.push(payload);
      Object.assign(requests[0], { status: route.request().url().endsWith('/approve') ? 'APPROVED' : 'REJECTED',
        grantedRole: payload.grantedRole ?? null, reviewerNotes: payload.notes, reviewedAt: '2026-10-13T12:00:00Z',
        reviewer: { firstName: 'Admin', lastName: 'Reviewer', email: 'admin@example.test' } });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ requests: options.empty ? [] : requests }) });
  });
  return { ...fixture, writes, failWrites: () => { failWrites = true; } };
}

test('admin navbar retains People on Overview and fits without horizontal scrolling', async t => {
  const { page, nav, open } = await peopleSetup(t);
  await open();
  await page.getByRole('heading', { name: 'People directory' }).waitFor();
  await page.addStyleTag({ content: styles });
  await nav('Overview').click();
  await page.waitForURL('**/overview');
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await nav('People').waitFor();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.locator('nav').evaluate(element => element.scrollWidth <= element.clientWidth), true);
  }
  await nav('People').click();
  await page.getByRole('heading', { name: 'People directory' }).waitFor();
});

test('admin View as on Overview updates navbar permissions without leaving the route', async t => {
  const { page, nav, open } = await setup(t, '/overview', 'ADMIN');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await nav('People').waitFor();
  await page.getByRole('button', { name: /View as/ }).click();
  await page.getByRole('button', { name: 'Lead Consultant', exact: true }).click();
  await page.locator('header').getByText('Lead Consultant', { exact: true }).first().waitFor();
  await nav('People').waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).pathname, '/overview');
  await page.getByRole('button', { name: /View as/ }).click();
  await page.getByRole('button', { name: 'Administrator', exact: true }).click();
  await nav('People').waitFor();
  assert.equal(new URL(page.url()).pathname, '/overview');
});

test('admin directory filters, confirms role updates, and shows failures', async t => {
  const { page, nav, open, writes, failWrites } = await peopleSetup(t);
  await open(); await page.getByRole('heading', { name: 'People directory' }).waitFor();
  assert.equal(await nav('People').isVisible(), true);
  await page.getByLabel('Search people', { exact: true }).fill('CASEY@EXAMPLE.TEST');
  await page.getByText('casey@example.test', { exact: true }).waitFor();
  await page.getByLabel('Search people', { exact: true }).fill('casey');
  assert.equal(await page.getByText('riley@example.test', { exact: true }).count(), 0);
  await page.getByLabel('Role filter', { exact: true }).selectOption('PM');
  await page.getByText('No people match your filters.', { exact: true }).waitFor();
  await page.getByLabel('Role filter', { exact: true }).selectOption('');
  await page.getByLabel('Team filter', { exact: true }).selectOption('team-1');
  await page.getByLabel('Role for casey@example.test').selectOption('LC');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Save role', exact: true }).click();
  assert.equal(writes.length, 0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save role', exact: true }).click();
  await page.getByText('Role updated for Casey Test.', { exact: true }).waitFor();
  assert.deepEqual(writes, [{ role: 'LC' }]);
  failWrites();
  await page.getByLabel('Role for casey@example.test').selectOption('PM');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save role', exact: true }).click();
  await page.getByText('Role update failed', { exact: true }).waitFor();
  assert.equal(await page.getByRole('cell', { name: 'Lead Consultant', exact: true }).count(), 1);
});

test('onboarding defaults requested role, accepts another role, and preserves review history', async t => {
  const { page, open, writes } = await peopleSetup(t);
  await open();
  const request = page.getByRole('article', { name: 'Request from alex@example.test' });
  await request.waitFor();
  assert.equal(await request.getByLabel('Grant role').inputValue(), 'CONSULTANT');
  await request.getByLabel('Grant role').selectOption('PM');
  await request.getByLabel('Reviewer notes', { exact: true }).fill('Approved for project leadership');
  page.once('dialog', dialog => dialog.accept());
  await request.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByText('No pending onboarding requests.', { exact: true }).waitFor();
  assert.deepEqual(writes, [{ notes: 'Approved for project leadership', grantedRole: 'PM' }]);
  await page.getByLabel('Request status').selectOption('APPROVED');
  await request.getByText('Admin Reviewer', { exact: true }).waitFor();
  assert.equal(await request.getByText('Consultant', { exact: true }).isVisible(), true);
  assert.equal(await request.getByText('Project Manager', { exact: true }).isVisible(), true);
  assert.equal(await request.getByText('Approved for project leadership', { exact: true }).isVisible(), true);
});

test('onboarding rejection preserves notes', async t => {
  const { page, open, writes } = await peopleSetup(t);
  await open();
  const request = page.getByRole('article', { name: 'Request from alex@example.test' });
  await request.getByLabel('Reviewer notes', { exact: true }).fill('Please contact your PM');
  page.once('dialog', dialog => dialog.accept());
  await request.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByText('No pending onboarding requests.', { exact: true }).waitFor();
  assert.deepEqual(writes, [{ notes: 'Please contact your PM' }]);
  await page.getByLabel('Request status').selectOption('REJECTED');
  await request.getByText('Please contact your PM', { exact: true }).waitFor();
});

test('People has loading, empty, and API error states', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const empty = await peopleSetup(t, { empty: true, gate });
  await empty.open(); await empty.page.getByRole('status').waitFor(); release();
  await empty.page.getByText('No CMS users yet.', { exact: true }).waitFor();
  await empty.page.getByText('No pending onboarding requests.', { exact: true }).waitFor();
  const failed = await peopleSetup(t, { fail: true });
  await failed.open(); await failed.page.getByText('Directory unavailable', { exact: true }).waitFor();
});

test('Slack Settings keeps connection controls without onboarding requests or polling', async t => {
  const { page, state, open } = await setup(t, '/settings/slack', 'ADMIN');
  await open();
  await page.getByRole('heading', { name: /Slack/ }).first().waitFor();
  await page.clock.install(); await page.clock.fastForward(31000);
  assert.equal(await page.getByText('Role Onboarding Requests', { exact: true }).count(), 0);
  assert.equal(state.calls.includes('/onboarding/requests'), false);
  assert.equal(await page.getByRole('button', { name: /Connect Slack/ }).count(), 1);
});
