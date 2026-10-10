const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildBundle, document } = require('./navigation-browser/bundle.cjs');
const { responseFor } = require('./navigation-browser/fixtures.cjs');
let browser, bundle;

// Use a locally installed Playwright package, or the runtime's NODE_PATH.
before(async () => {
  bundle = await buildBundle();
  browser = await chromium.launch({ channel: process.env.NAVIGATION_BROWSER_CHANNEL || 'chrome', headless: true });
});
after(() => browser?.close());

async function setup(t, initialPath) {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.route('http://navigation.test/**', route => route.fulfill({
    contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html',
    body: route.request().url().endsWith('/bundle.js') ? bundle : document,
  }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  const state = { calls: [], gate: null, failSprints: false };
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname.slice(4);
    state.calls.push(pathname);
    if (state.gate && pathname !== '/auth/role' && pathname !== '/notifications/my') await state.gate;
    const failed = state.failSprints && pathname.endsWith('/sprints');
    await route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(failed ? { message: 'Temporary outage' } : responseFor(pathname, 'PM')) });
  });
  return { page, state,
    nav: label => page.locator('nav').getByRole('link', { name: label, exact: true }),
    open: () => page.goto('http://navigation.test' + initialPath),
  };
}

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

test('writes invalidate other tabs and logout clears cached data', async t => {
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
