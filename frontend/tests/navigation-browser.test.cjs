const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, document, readBundle } = require('./navigation-browser/server.cjs');
const { responseFor } = require('./navigation-browser/fixtures.cjs');
let server, url, browser;

before(async () => {
  ({ server, url } = await startServer());
  url = 'http://navigation.test';
  browser = await chromium.launch({ channel: process.env.NAVIGATION_BROWSER_CHANNEL || 'chrome', headless: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

async function setup(t, initialPath = '/deliverables') {
  const context = await browser.newContext();
  // No network access is needed: render the compiled app in Chrome from fixtures.
  await context.route('http://navigation.test/**', route => route.fulfill({
    contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html',
    body: route.request().url().endsWith('/bundle.js') ? readBundle() : document,
  }));
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'browser must not report uncaught errors'));
  const state = { calls: [], failRole: false, failSprints: false, role: 'PM', gate: null };
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname.slice(4);
    state.calls.push(pathname);
    if (state.gate && pathname !== '/auth/role' && pathname !== '/notifications/my') await state.gate;
    const failed = state.failRole && pathname === '/auth/role' || state.failSprints && pathname.endsWith('/sprints');
    await route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(failed ? { message: 'Temporary outage' } : responseFor(pathname, state.role)) });
  });
  const nav = label => page.locator('nav').getByRole('link', { name: label, exact: true });
  const open = async () => { await page.goto(url + initialPath); };
  return { page, state, nav, open };
}

test('the navbar remains usable while a cold page is waiting for data', async t => {
  const { page, state, nav, open } = await setup(t);
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await open();
  await page.getByRole('status').waitFor();
  await nav('Slides').click();
  await page.waitForURL('**/slides');
  assert.equal(await nav('Attendance').isVisible(), true);
  release();
  await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
});

test('Slides loads the correct scope once and project selection does not reload submissions', async t => {
  const { page, state, nav, open } = await setup(t, '/slides');
  await open();
  await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
  assert.equal(state.calls.filter(path => path === '/slide-submissions/all').length, 1);
  assert.equal(state.calls.includes('/slide-submissions/my'), false);
  assert.equal(state.calls.filter(path => path === '/projects/team-1/sprints').length, 1);
  await page.locator('main select').selectOption('team-2');
  await page.getByText('team-2 Draft deck', { exact: true }).waitFor();
  assert.equal(state.calls.filter(path => path === '/slide-submissions/all').length, 1);
  await page.evaluate(() => window.navigationTest.tokenProgress(true));
  assert.equal(await nav('Deliverables').isVisible(), true);
  assert.equal(await page.locator('main select').inputValue(), 'team-2');
  await page.evaluate(() => window.navigationTest.tokenProgress(false));
  assert.equal(state.calls.filter(path => path === '/slide-submissions/all').length, 1);
});

test('a consultant loads only their submissions', async t => {
  const { page, state, open } = await setup(t, '/slides');
  state.role = 'CONSULTANT';
  await page.addInitScript(() => { window.navigationTestEmail = 'consultant@example.test'; });
  await open();
  await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
  assert.equal(state.calls.filter(path => path === '/slide-submissions/my').length, 1);
  assert.equal(state.calls.includes('/slide-submissions/all'), false);
});

test('return visits restore content and the selected project during a delayed or failed refresh', async t => {
  const { page, state, nav, open } = await setup(t, '/slides');
  await open();
  await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
  await page.locator('main select').selectOption('team-2');
  await page.getByText('team-2 Draft deck', { exact: true }).waitFor();
  await nav('Attendance').click();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  await nav('Deliverables').click();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await nav('Slides').click();
  await page.getByText('team-2 Draft deck', { exact: true }).waitFor();
  assert.equal(await page.locator('main select').inputValue(), 'team-2');
  assert.equal(await page.getByRole('status').count(), 0);
  state.failSprints = true;
  release();
  await page.getByText('Failed to load slides. Please try again.', { exact: true }).waitFor();
  assert.equal(await page.getByText('team-2 Draft deck', { exact: true }).isVisible(), true);
  state.failSprints = false;
  await nav('Attendance').click();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  assert.equal(await page.getByRole('status').count(), 0);
  await nav('Deliverables').click();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  assert.equal(await page.getByRole('status').count(), 0);
});

test('writes invalidate other tabs and logout clears their snapshots', async t => {
  const { page, state, nav, open } = await setup(t, '/attendance');
  await open();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  await nav('Slides').click();
  await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
  await page.evaluate(() => window.navigationTest.write().then(() => true));
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await nav('Attendance').click();
  await page.getByRole('status').waitFor();
  assert.equal(await page.getByText('Team weekly check-in', { exact: true }).count(), 0);
  assert.equal(await nav('Slides').isVisible(), true);
  release();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  const key = JSON.stringify(['attendance', 'pm@example.test', null]);
  await page.waitForFunction(key => Boolean(window.navigationTest.readSnapshot(key)), key);
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), key), undefined);
});

test('switching accounts does not render the previous account snapshot', async t => {
  const { page, state, nav, open } = await setup(t, '/attendance');
  await open();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await page.evaluate(() => window.navigationTest.setEmail('other@example.test'));
  await page.getByRole('status').waitFor();
  assert.equal(await page.getByText('Team weekly check-in', { exact: true }).count(), 0);
  assert.equal(await nav('Slides').isVisible(), true);
  release();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
});

for (const [route, text] of [['deliverables', 'team-1 Research'], ['slides', 'team-1 Draft deck'], ['attendance', 'Team weekly check-in']]) {
  test(`${route} retries role lookup on the same page`, async t => {
    const { page, state, open } = await setup(t, '/' + route);
    state.failRole = true;
    await open();
    await page.getByRole('alert').waitFor();
    assert.equal(new URL(page.url()).pathname, '/' + route);
    state.failRole = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText(text, { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/' + route);
  });
}
