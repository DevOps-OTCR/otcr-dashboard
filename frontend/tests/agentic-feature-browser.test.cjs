const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildBundle, document } = require('./navigation-browser/bundle.cjs');
let browser, bundle;
before(async () => {
  const fixture = path.join(__dirname, 'agentic-feature-browser');
  bundle = await buildBundle({ outputName: 'agentic-feature-browser', entry: path.join(fixture, 'entry.tsx'),
    aliases: { './AuthContext$': path.join(fixture, 'auth.tsx'), '@/lib/api$': path.join(fixture, 'api.ts'),
      '@/features/agentic-cms$': path.join(fixture, 'feature.tsx') } });
  browser = await chromium.launch({ headless: true,
    ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}) });
});
after(() => browser?.close());

async function setup(t, payload = { agenticCms: false }, status = 200) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const state = { payload, status, calls: 0, hold: null };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, 'http://flag.test');
    if (url.pathname === '/api/feature-flags') {
      state.calls += 1;
      assert.equal(route.request().headers().authorization, 'Bearer synthetic-token');
      const body = state.payload;
      if (state.hold) await state.hold;
      return route.fulfill({ status: state.status, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fulfill({ contentType: url.pathname === '/bundle.js' ? 'text/javascript' : 'text/html',
      body: url.pathname === '/bundle.js' ? bundle : document });
  });
  const page = await context.newPage();
  const initialFlag = page.waitForResponse('**/api/feature-flags');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto('http://flag.test');
  await page.getByRole('button', { name: 'Sign out' }).waitFor();
  return { page, state, initialFlag };
}

for (const [name, payload, status] of [
  ['off', { agenticCms: false }, 200], ['malformed', { agenticCms: 'true' }, 200],
  ['old backend', {}, 404], ['unavailable backend', {}, 503],
]) {
  test(`does not load feature code or run effects when ${name}`, async t => {
    const { page, initialFlag } = await setup(t, payload, status);
    await initialFlag;
    assert.equal(await page.getByTestId('agentic-feature').count(), 0);
    assert.deepEqual(await page.evaluate(() => [window.featureLoads ?? 0, window.featureEffects ?? 0]), [0, 0]);
  });
}

test('loads only after approval, hides on revocation, and resets on sign-out', async t => {
  const { page, state } = await setup(t, { agenticCms: true });
  const feature = page.getByTestId('agentic-feature');
  await feature.waitFor();
  assert.equal(await page.evaluate(() => window.featureLoads), 1);
  state.payload = { agenticCms: false };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await feature.waitFor({ state: 'hidden' });
  state.payload = { agenticCms: true };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await feature.waitFor();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await feature.waitFor({ state: 'hidden' });
  let release;
  state.hold = new Promise(resolve => { release = resolve; });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  assert.equal(await feature.count(), 0);
  release();
  state.hold = null;
  await feature.waitFor();
});

test('a late grant cannot enable a different account', async t => {
  const { page, state, initialFlag } = await setup(t, { agenticCms: false });
  await initialFlag;
  let release;
  state.payload = { agenticCms: true };
  state.hold = new Promise(resolve => { release = resolve; });
  const pending = page.waitForRequest('**/api/feature-flags');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await pending;
  state.payload = { agenticCms: false };
  state.hold = null;
  const switched = page.waitForResponse('**/api/feature-flags');
  await page.getByRole('button', { name: 'Switch account' }).click();
  await switched;
  const late = page.waitForResponse('**/api/feature-flags');
  release();
  await late;
  assert.equal(await page.getByTestId('agentic-feature').count(), 0);
  assert.equal(await page.evaluate(() => window.featureLoads ?? 0), 0);
});
