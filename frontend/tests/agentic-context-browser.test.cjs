const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildBundle, document } = require('./navigation-browser/bundle.cjs');
let browser, bundle;
before(async () => {
  bundle = await buildBundle({ outputName: 'agentic-context-browser', entry: path.join(__dirname, 'agentic-feature-browser/context-entry.tsx'), aliases: {
    './AuthContext$': path.join(__dirname, 'agentic-feature-browser/context-auth.tsx'),
    '@/lib/api$': path.join(__dirname, 'agentic-feature-browser/context-api.ts'),
    '@/lib/permissions$': path.join(__dirname, 'agentic-feature-browser/context-permissions.ts'),
    '@/components/AuthContext$': path.join(__dirname, 'agentic-feature-browser/context-auth.tsx'),
    '@/features/agentic-cms$': path.join(__dirname, '../features/agentic-cms/index.tsx'),
  }});
  browser = await chromium.launch({ headless: true, ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}) });
});
after(() => browser?.close());
test('separates context and call notes and keeps consultant content read-only', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto('http://context.test/agentic-cms');
  await page.getByRole('button', { name: 'Project context' }).waitFor();
  assert.equal(await page.getByRole('textbox').count(), 0);
  assert.equal(await page.getByText('Read only overview').count(), 1);
  assert.equal(await page.getByText('SOW text').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Save context' }).count(), 0);
  await page.getByRole('button', { name: 'Client call notes' }).click();
  assert.equal(await page.locator('article').filter({ hasText: 'Call notes' }).count(), 1);
  assert.equal(await page.getByRole('textbox', { name: 'Note text' }).count(), 0);
});

test('shows editable context controls for an Admin role', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto('http://context.test/agentic-cms?role=ADMIN');
  await page.getByRole('button', { name: 'Project context' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Overview' }).isEditable(), true);
  assert.equal(await page.getByRole('textbox', { name: 'SOW / Scope' }).isEditable(), true);
  assert.equal(await page.getByRole('button', { name: 'Save context' }).count(), 1);
});

test('does not show the context tabs when the account has no accessible projects', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto('http://context.test/agentic-cms?projects=none');
  await page.getByRole('heading', { name: 'Agentic CMS' }).waitFor();
  assert.equal(await page.getByRole('tablist', { name: 'Agentic CMS tools' }).count(), 0);
});
