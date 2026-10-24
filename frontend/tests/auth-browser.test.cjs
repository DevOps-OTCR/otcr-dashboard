const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildBundle, document } = require('./navigation-browser/bundle.cjs');
let browser, bundle;
before(async () => {
  bundle = await buildBundle({ realMsal: true, outputName: 'auth-browser', entry: path.join(__dirname, 'auth-browser/entry.tsx') });
  browser = await chromium.launch({ headless: true,
    ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}) });
});
after(() => browser?.close());

async function setup(t, slowCacheOperations = false) {
  const context = await browser.newContext();
  t.after(async () => {
    for (const page of context.pages()) {
      const state = await page.evaluate(() => ({
        page: document.body.innerText,
        account: document.querySelector('[data-testid="account"]')?.textContent,
        hasAuthHeader: Boolean(window.authTest?.authHeader()),
        sdk: window.authTest?.diagnostics(),
      }));
      t.diagnostic(JSON.stringify(state));
    }
    await context.close();
  });
  if (slowCacheOperations) await context.addInitScript(() => {
    // Delay real cache work without reordering MSAL's private broadcast handlers.
    for (const method of ['encrypt', 'decrypt']) {
      const operation = SubtleCrypto.prototype[method];
      SubtleCrypto.prototype[method] = async function (...args) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return operation.apply(this, args);
      };
    }
  });
  const externalRequests = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://session.test') {
      externalRequests.push(url.origin + url.pathname);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ role: 'PM' }) });
    return route.fulfill({ contentType: url.pathname === '/bundle.js' ? 'text/javascript' : 'text/html',
      body: url.pathname === '/bundle.js' ? bundle : document });
  });
  const page = async (route = '/sign-in') => {
    const result = await context.newPage();
    result.setDefaultTimeout(10000);
    const errors = [];
    result.on('pageerror', error => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, []));
    await result.goto('https://session.test' + route);
    await result.waitForFunction(() => window.authTest);
    return result;
  };
  const first = await page();
  await Promise.all([first.waitForEvent('load'), first.getByRole('button', { name: 'Sign in with Microsoft' }).click()]);
  await first.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
  await first.waitForFunction(() => window.authTest.authHeader() === 'Bearer synthetic-token-for-pm@example.test');
  t.after(() => assert.deepEqual(externalRequests, []));
  return { first, page };
}

test('real MSAL cache restores the same account in fresh root/direct-link tabs and on refresh', async t => {
  const { page } = await setup(t);
  for (const route of ['/', '/deliverables']) {
    const other = await page(route);
    await other.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
    assert.equal(await other.getByTestId('account').textContent(), 'pm@example.test');
    assert.equal(await other.evaluate(() => window.authTest.interactiveLogins()), 0);
    await other.reload();
    await other.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
    assert.equal(await other.getByTestId('account').textContent(), 'pm@example.test');
  }
});

test('explicit CMS sign-out propagates, remains signed out after refresh, and allows explicit sign-in again', async t => {
  const { first, page } = await setup(t, true);
  const second = await page('/deliverables');
  await second.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
  await first.getByRole('button', { name: 'Sign Out' }).click();
  for (const current of [first, second, await page('/deliverables')]) {
    await current.getByRole('heading', { name: 'CMS sign-in' }).waitFor();
    await current.reload();
    await current.getByRole('heading', { name: 'CMS sign-in' }).waitFor();
    assert.equal(await current.evaluate(() => window.authTest.authHeader()), null);
  }
  await Promise.all([second.waitForEvent('load'), second.getByRole('button', { name: 'Sign in with Microsoft' }).click()]);
  await first.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
  await second.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
});

test('a late token response in another tab cannot restore the signed-out session', async t => {
  const { first, page } = await setup(t);
  const second = await page('/deliverables');
  await second.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
  await second.evaluate(() => window.authTest.holdToken());
  await second.waitForFunction(() => window.authTest.tokenIsPending());
  await first.getByRole('button', { name: 'Sign Out' }).click();
  await second.getByRole('heading', { name: 'CMS sign-in' }).waitFor();
  assert.equal(await second.evaluate(() => window.authTest.finishToken()), 'AbortError');
  const third = await page('/deliverables');
  await third.getByRole('heading', { name: 'CMS sign-in' }).waitFor();
  assert.deepEqual(await third.evaluate(() => window.authTest.accounts()), []);
});

test('protected links wait for SDK initialization instead of redirecting early', async t => {
  const { page } = await setup(t);
  const slow = await page('/deliverables?slow');
  assert.equal(new URL(slow.url()).pathname, '/deliverables');
  await slow.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
  assert.equal(new URL(slow.url()).pathname, '/deliverables');
});

test('signed-out tabs finish SDK initialization before showing the sign-in form', async t => {
  const { first, page } = await setup(t);
  await first.getByRole('button', { name: 'Sign Out' }).click();
  const slow = await page('/sign-in?slow');
  assert.equal(await slow.getByRole('button', { name: 'Sign in with Microsoft' }).count(), 0);
  await slow.getByRole('heading', { name: 'CMS sign-in' }).waitFor();
  await Promise.all([slow.waitForEvent('load'), slow.getByRole('button', { name: 'Sign in with Microsoft' }).click()]);
  await slow.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
  await first.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
});

test('a newly selected account replaces the previous account across tabs', async t => {
  const { first, page } = await setup(t, true);
  const second = await page('/deliverables');
  await second.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
  await second.waitForFunction(() => window.authTest.authHeader() === 'Bearer synthetic-token-for-pm@example.test');
  await Promise.all([first.waitForEvent('load'), first.evaluate(() => window.authTest.seed('consultant@example.test'))]);
  for (const current of [first, second, await page('/deliverables')]) {
    await current.waitForFunction(() => document.querySelector('[data-testid="account"]')?.textContent === 'consultant@example.test');
    await current.waitForFunction(() => window.authTest.authHeader() === 'Bearer synthetic-token-for-consultant@example.test');
  }
});

test('expired sessions requiring interaction reach the normal sign-in screen without an automatic popup', async t => {
  const { page } = await setup(t);
  const expired = await page('/deliverables?expired');
  await expired.getByRole('heading', { name: 'CMS sign-in' }).waitFor();
  assert.equal(new URL(expired.url()).pathname, '/sign-in');
  assert.equal(await expired.evaluate(() => window.authTest.interactiveLogins()), 0);
  assert.equal(await expired.evaluate(() => window.authTest.authHeader()), null);
});

test('token requests use the CMS-selected account when the SDK active-account hint is stale', async t => {
  const { first } = await setup(t, true);
  await Promise.all([first.waitForEvent('load'), first.evaluate(() => window.authTest.seed('consultant@example.test'))]);
  await first.waitForFunction(() => document.querySelector('[data-testid="account"]')?.textContent === 'consultant@example.test');
  assert.equal(await first.evaluate(() => window.authTest.tokenWithActiveAccount('pm@example.test')),
    'synthetic-token-for-consultant@example.test');
});

test('a failed session restore can return to sign-in and clear cached credentials', async t => {
  const { first, page } = await setup(t);
  const unavailable = await page('/deliverables?unavailable');
  await unavailable.getByRole('heading', { name: 'Unable to finish sign-in' }).waitFor();
  await unavailable.getByRole('button', { name: 'Return to sign-in' }).click();
  await unavailable.getByRole('heading', { name: 'CMS sign-in' }).waitFor();
  await first.getByRole('heading', { name: 'CMS sign-in' }).waitFor();
  assert.equal(await unavailable.evaluate(() => window.authTest.authHeader()), null);
  assert.deepEqual(await unavailable.evaluate(() => window.authTest.accounts()), []);
});

test('pageshow preserves an explicit login redirect after a persisted sign-out', async t => {
  const { first, page } = await setup(t);
  await first.getByRole('button', { name: 'Sign Out' }).click();
  const callback = await page('/auth/callback?redirect');
  await callback.waitForFunction(() => window.authTest.redirectIsPending());
  await callback.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await callback.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(new URL(callback.url()).pathname, '/auth/callback');
  await callback.evaluate(() => window.authTest.finishRedirect());
  await callback.getByRole('heading', { name: 'Protected CMS page' }).waitFor();
});
