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
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  assert.equal(await page.getByRole('textbox').count(), 0);
  assert.equal(await page.getByText('Read only overview').count(), 1);
  assert.equal(await page.getByText('SOW text').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Save context' }).count(), 0);
  await page.getByRole('tab', { name: 'Client Call Notes' }).click();
  assert.equal(await page.locator('article').filter({ hasText: 'Call notes' }).count(), 1);
  assert.equal(await page.getByRole('textbox', { name: 'Note text' }).count(), 0);
});

test('shows editable context controls for an Admin role', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto('http://context.test/agentic-cms?role=ADMIN');
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Overview' }).isEditable(), true);
  assert.equal(await page.getByRole('textbox', { name: 'SOW / Scope' }).isEditable(), true);
  assert.equal(await page.getByRole('button', { name: 'Save context' }).count(), 1);
  await page.getByRole('textbox', { name: 'Overview' }).fill('Updated synthetic overview');
  await page.getByRole('button', { name: 'Save context' }).click();
  await page.reload();
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Overview' }).inputValue(), 'Updated synthetic overview');
});

test('hides PM edit controls for projects they do not own', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto('http://context.test/agentic-cms?role=PM');
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  await page.getByRole('combobox', { name: 'Project' }).selectOption('p2');
  await page.getByText('Other project scope').waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Overview' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Save context' }).count(), 0);
});

test('ignores a late project response after switching back to another project', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto('http://context.test/agentic-cms?role=ADMIN&delayProjectTwo');
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  await page.getByText('Read only overview').waitFor();
  const project = page.getByRole('combobox', { name: 'Project' });
  await project.selectOption('p2');
  await project.selectOption('p1');
  await page.getByText('Read only overview').waitFor();
  await page.waitForTimeout(150);
  assert.equal(await page.getByText('SOW text').count(), 1);
  assert.equal(await page.getByText('Other project overview').count(), 0);
});

test('shows project load errors without leaving old project content on screen', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto('http://context.test/agentic-cms?failProjectTwo');
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  await page.getByText('Read only overview').waitFor();
  await page.getByRole('combobox', { name: 'Project' }).selectOption('p2');
  await page.getByRole('alert').getByText('Could not load this project context. Try again.').waitFor();
  assert.equal(await page.getByText('Read only overview').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Retry' }).count(), 1);
});

test('mounts when its portal target is added after the route component', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto('http://context.test/agentic-cms?lateMount');
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Agentic CMS' }).count(), 1);
});

test('does not show the context tabs when the account has no accessible projects', async t => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto('http://context.test/agentic-cms?projects=none');
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole('heading', { name: 'Agentic CMS' }).count(), 0);
  assert.equal(await page.getByRole('tablist', { name: 'Agentic CMS tools' }).count(), 0);
});

const openContext = async (t, query) => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto(`http://context.test/agentic-cms?${query}`);
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  return page;
};

test('keeps current-project context drafts after a failed save and saves them on retry', async t => {
  const page = await openContext(t, 'role=PM&failSaveOnce');
  const overview = page.getByRole('textbox', { name: 'Overview' });
  const scope = page.getByRole('textbox', { name: 'SOW / Scope' });
  await overview.fill('Draft overview — line 1\nline 2');
  await scope.fill('Draft scope: phase A & B');
  await page.getByRole('button', { name: 'Save context' }).click();
  await page.getByRole('alert').getByText('Unable to save context. Check your access and try again.').waitFor();
  assert.equal(await overview.inputValue(), 'Draft overview — line 1\nline 2');
  assert.equal(await scope.inputValue(), 'Draft scope: phase A & B');
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('status').getByText('Context saved.').waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.reload();
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Overview' }).inputValue(), 'Draft overview — line 1\nline 2');
  assert.equal(await page.getByRole('textbox', { name: 'SOW / Scope' }).inputValue(), 'Draft scope: phase A & B');
});

test('keeps a current-project note draft after a failed add and adds it on retry', async t => {
  const page = await openContext(t, 'role=PM&failNoteOnce');
  await page.getByRole('tab', { name: 'Client Call Notes' }).click();
  const title = page.getByRole('textbox', { name: 'Note title' });
  const text = page.getByRole('textbox', { name: 'Note text' });
  await title.fill('Synthetic call 7');
  await text.fill('Client asked for\nweekly updates.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByRole('alert').getByText('Unable to add note. Check your access and try again.').waitFor();
  assert.equal(await title.inputValue(), 'Synthetic call 7');
  assert.equal(await text.inputValue(), 'Client asked for\nweekly updates.');
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('status').getByText('Note added.').waitFor();
  const note = page.locator('article').filter({ hasText: 'Synthetic call 7' });
  assert.equal(await note.count(), 1);
  assert.equal(await note.locator('p').textContent(), 'Client asked for\nweekly updates.');
  assert.equal(await title.inputValue(), '');
  await page.reload();
  await page.getByRole('tab', { name: 'Client Call Notes' }).click();
  assert.equal(await page.locator('article').filter({ hasText: 'Synthetic call 7' }).count(), 1);
});
