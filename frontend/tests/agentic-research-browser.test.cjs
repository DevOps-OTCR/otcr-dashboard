const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildBundle, buildStyles, document } = require('./navigation-browser/bundle.cjs');
let browser, bundle, styles;

before(async () => {
  const fixtures = path.join(__dirname, 'agentic-feature-browser');
  [bundle, styles] = await Promise.all([
    buildBundle({ outputName: 'agentic-research-browser', entry: path.join(fixtures, 'entry.tsx'), aliases: {
      './AuthContext$': path.join(fixtures, 'auth.tsx'),
      '@/components/AuthContext$': path.join(fixtures, 'auth.tsx'),
      '@/lib/permissions$': path.join(fixtures, 'context-permissions.ts'),
    } }), buildStyles(),
  ]);
  browser = await chromium.launch({ headless: true, ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}) });
});
after(() => browser?.close());

const blank = () => ({ schemaVersion: 1, sections: [
  { id: 'past-data', tab: 'past-data', title: 'Relevant Past Data', content: '', sourceIds: [] },
  { id: 'framework', tab: 'framework', title: 'Framework / Structure', content: '', sourceIds: [] },
  { id: 'findings', tab: 'findings', title: 'Findings', content: '', sourceIds: [] },
], sources: [] });
const textName = { 'past-data': 'Relevant Past Data text past-data', framework: 'Framework / Structure text framework', findings: 'Findings text findings' };
const tabName = { 'past-data': 'Relevant Past Data', framework: 'Framework / Structure', findings: 'Findings' };
const clone = value => JSON.parse(JSON.stringify(value));

async function setup(t, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 1280, height: 960 } });
  t.after(() => context.close());
  const state = {
    enabled: true, editable: true, failSaveOnce: false, conflict: false,
    failReadOnce: false, failDeliverablesOnce: false, failHistoryOnce: false,
    failInitializeOnce: false, empty: false, paged: false, acceptDialog: true,
    calls: [], workspaces: {}, revisions: {}, holdWrite: null, holdRead: null,
    dialogs: [], ...options,
  };
  const seed = (id = 'd1', doc = blank(), version = 1) => {
    const projectId = id === 'd3' ? 'p2' : 'p1';
    state.workspaces[id] = { id: `workspace-${id}`, projectId, deliverableId: id, version, document: clone(doc), storage: 'cms', updatedAt: '2026-11-24T12:00:00Z' };
    state.revisions[id] = [{ version, document: clone(doc), action: 'INITIALIZE', restoredFromVersion: null, authorId: 'synthetic-user', createdAt: '2026-11-24T12:00:00Z' }];
  };
  if (options.seed) seed();
  const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  const errors = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: url.pathname === '/bundle.js' ? 'text/javascript' : 'text/html', body: url.pathname === '/bundle.js' ? bundle : document.replace('<html>', '<html><head><meta charset="utf-8"></head>').replace('</body>', `<style>${styles}</style></body>`) });
    state.calls.push({ method: request.method(), path: url.pathname, page: url.searchParams.get('page'), body: request.postDataJSON() });
    assert.equal(request.headers().authorization, 'Bearer synthetic-token');
    if (url.pathname === '/api/feature-flags') return json(route, { agenticCms: state.enabled });
    if (url.pathname === '/api/projects') return json(route, { projects: [{ id: 'p1', name: 'Project One' }, { id: 'p2', name: 'Project Two' }] });
    if (/\/context\/projects\//.test(url.pathname)) return json(route, { project: { overview: 'Project overview', scope: 'Project scope' }, notes: [], canEdit: false });
    if (url.pathname === '/api/deliverables') {
      if (state.failDeliverablesOnce) { state.failDeliverablesOnce = false; return json(route, {}, 503); }
      const page = Number(url.searchParams.get('page') || 1);
      const list = url.searchParams.get('projectId') === 'p2'
        ? [{ id: 'd3', title: 'Project Two assignment' }]
        : [{ id: 'd1', title: 'Market research', sprint: { label: 'Week 1' } }, { id: 'd2', title: 'Client recommendation', sprint: { label: 'Week 1' } }];
      return json(route, { deliverables: state.empty ? [] : state.paged && page === 2 ? [{ id: 'd4', title: 'Second-page assignment' }] : list, pagination: { totalPages: state.paged ? 2 : 1 } });
    }
    const match = url.pathname.match(/\/research\/projects\/(p[12])\/deliverables\/(d\d)(.*)$/);
    if (!match) { errors.push(`Unexpected request: ${url.pathname}`); return json(route, {}, 500); }
    const [, projectId, id, suffix] = match;
    if ((id === 'd3') !== (projectId === 'p2')) return json(route, { code: 'NOT_FOUND_OR_FORBIDDEN' }, 404);
    const workspace = state.workspaces[id];
    if (request.method() === 'GET' && suffix === '') {
      if (state.failReadOnce) { state.failReadOnce = false; return json(route, {}, 503); }
      const result = workspace ? { ...clone(workspace), canEdit: state.editable } : { code: 'WORKSPACE_NOT_INITIALIZED', canEdit: state.editable };
      if (state.holdRead) await state.holdRead(id);
      return json(route, result, workspace ? 200 : 404);
    }
    if (request.method() === 'GET' && suffix === '/revisions') {
      if (state.failHistoryOnce) { state.failHistoryOnce = false; return json(route, {}, 503); }
      const before = Number(url.searchParams.get('beforeVersion')) || Infinity;
      const items = (state.revisions[id] ?? []).filter(revision => revision.version < before).slice().reverse();
      const result = { items: items.slice(0, 10).map(({ document: _document, ...revision }) => revision), nextBeforeVersion: items.length > 10 ? items[9].version : null };
      if (state.holdHistory) await state.holdHistory();
      return json(route, result);
    }
    if (!state.editable) return json(route, { code: 'NOT_FOUND_OR_FORBIDDEN' }, 404);
    if (request.method() === 'POST' && suffix === '') {
      if (state.failInitializeOnce) { state.failInitializeOnce = false; return json(route, {}, 503); }
      if (!workspace) seed(id);
      return json(route, { ...state.workspaces[id], canEdit: true }, 201);
    }
    const body = request.postDataJSON();
    if (state.holdWrite) await state.holdWrite(id);
    if (state.failSaveOnce) { state.failSaveOnce = false; return json(route, {}, 503); }
    if (state.conflict) {
      state.conflict = false;
      workspace.version += 1;
      workspace.document.sections[0].content = 'Saved by a teammate';
    }
    if (body.expectedVersion !== workspace.version) return json(route, { code: 'VERSION_CONFLICT' }, 409);
    const savedDocument = suffix === '/restore' ? state.revisions[id].find(revision => revision.version === body.targetVersion).document : body.document;
    workspace.document = clone(savedDocument); workspace.version += 1;
    state.revisions[id].push({ version: workspace.version, document: clone(savedDocument), action: suffix === '/restore' ? 'RESTORE' : 'EDIT', restoredFromVersion: body.targetVersion ?? null, authorId: 'synthetic-user', createdAt: '2026-11-24T12:01:00Z' });
    return json(route, { ...workspace, canEdit: true }, suffix === '/restore' ? 201 : 200);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { state.dialogs.push(dialog.message()); await (state.acceptDialog ? dialog.accept() : dialog.dismiss()); });
  t.after(() => assert.deepEqual(errors, []));
  await page.goto('http://research.test/agentic-cms');
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  if (state.enabled) {
    await page.getByRole('tab', { name: 'Research', exact: true }).click();
    if (!state.empty && !options.failDeliverablesOnce) await page.getByRole('combobox', { name: 'Research deliverable' }).waitFor();
  }
  return { page, state, seed };
}

const editor = page => page.getByRole('textbox', { name: textName['past-data'], exact: true });
async function openEditor(page) {
  await page.getByRole('button', { name: 'Create research workspace', exact: true }).click();
  await editor(page).waitFor();
}

test('flag-off never loads project/research data or exposes research controls', async t => {
  const { page, state } = await setup(t, { enabled: false });
  await page.getByText('Agentic CMS loads when this account is enabled for the feature.').waitFor();
  assert.equal(await page.getByRole('tab', { name: 'Research', exact: true }).count(), 0);
  assert.deepEqual(state.calls.map(call => call.path), ['/api/feature-flags']);
});

test('creates a workspace, edits all three tabs and saves/reloads without a model request', async t => {
  const { page, state } = await setup(t);
  assert.equal(state.calls.filter(call => call.method === 'POST').length, 0);
  await openEditor(page);
  for (const tab of Object.keys(textName)) {
    await page.getByRole('tab', { name: tabName[tab], exact: true }).click();
    await page.getByRole('textbox', { name: textName[tab], exact: true }).fill(`Research for ${tab}\nSecond line`);
  }
  await page.getByRole('button', { name: 'Save research', exact: true }).click();
  await page.getByText('Research saved.', { exact: true }).waitFor();
  assert.equal(state.workspaces.d1.version, 2);
  await page.reload();
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await editor(page).waitFor();
  for (const tab of Object.keys(textName)) {
    await page.getByRole('tab', { name: tabName[tab], exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: textName[tab], exact: true }).inputValue(), `Research for ${tab}\nSecond line`);
  }
  assert.equal(state.calls.some(call => /\/(chat|search|mcp)(\/|$)/.test(call.path)), false);
});

test('keeps drafts across tool tabs and failed saves, then retries the same text', async t => {
  const { page, state } = await setup(t, { seed: true, failSaveOnce: true });
  await editor(page).fill('Keep this draft');
  await page.getByRole('tab', { name: 'Project Context', exact: true }).click();
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  assert.equal(await editor(page).inputValue(), 'Keep this draft');
  await page.getByRole('button', { name: 'Save research', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not save research' }).waitFor();
  assert.equal(await editor(page).inputValue(), 'Keep this draft');
  await page.getByRole('button', { name: 'Save research', exact: true }).click();
  await page.getByText('Research saved.', { exact: true }).waitFor();
  assert.equal(state.workspaces.d1.document.sections[0].content, 'Keep this draft');
});

test('asks before discarding drafts when switching deliverables or projects', async t => {
  const { page, state } = await setup(t, { seed: true, acceptDialog: false });
  await editor(page).fill('Unsaved research');
  const deliverable = page.getByRole('combobox', { name: 'Research deliverable' });
  await deliverable.selectOption('d2');
  assert.equal(await deliverable.inputValue(), 'd1');
  assert.equal(await editor(page).inputValue(), 'Unsaved research');
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('p2');
  assert.equal(await page.getByRole('combobox', { name: 'Project', exact: true }).inputValue(), 'p1');
  state.acceptDialog = true;
  await deliverable.selectOption('d2');
  await page.getByRole('heading', { name: 'Research has not been started' }).waitFor();
  assert.equal(await editor(page).count(), 0);
  assert.equal(state.dialogs.length, 3);
});

test('keeps stale drafts on conflict and requires an explicit reload before another save', async t => {
  const { page } = await setup(t, { seed: true, conflict: true });
  await editor(page).fill('My draft');
  await page.getByRole('button', { name: 'Save research', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Research changed elsewhere' }).waitFor();
  assert.equal(await editor(page).inputValue(), 'My draft');
  assert.equal(await page.getByRole('button', { name: 'Save research', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Reload saved research' }).click();
  await editor(page).waitFor();
  assert.equal(await editor(page).inputValue(), 'Saved by a teammate');
});

test('uses server permissions for read-only workspaces and missing-workspace creation', async t => {
  const { page, state } = await setup(t, { seed: true, editable: false });
  await editor(page).waitFor();
  assert.equal(await editor(page).isEditable(), false);
  assert.equal(await page.getByRole('button', { name: 'Save research', exact: true }).count(), 0);
  await page.getByRole('combobox', { name: 'Research deliverable' }).selectOption('d2');
  await page.getByText('An assigned consultant or project manager can create this workspace.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Create research workspace' }).count(), 0);
  assert.equal(state.calls.filter(call => call.method === 'POST').length, 0);
});

test('shows retryable deliverable, read and initialization failures without auto-creating research', async t => {
  const { page, state } = await setup(t, { failDeliverablesOnce: true });
  await page.getByRole('button', { name: 'Retry deliverables' }).click();
  await page.getByRole('heading', { name: 'Research has not been started' }).waitFor();
  state.failReadOnce = true;
  await page.getByRole('combobox', { name: 'Research deliverable' }).selectOption('d2');
  await page.getByRole('button', { name: 'Retry research' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Create research workspace' }).count(), 0);
  await page.getByRole('button', { name: 'Retry research' }).click();
  state.failInitializeOnce = true;
  await page.getByRole('button', { name: 'Create research workspace' }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not save research' }).waitFor();
  await openEditor(page);
  assert.equal(state.workspaces.d2.version, 1);
});

test('restores the whole document as a new version after explicit confirmation', async t => {
  const { page, state } = await setup(t, { seed: true });
  await editor(page).fill('Saved research to undo');
  await page.getByRole('button', { name: 'Save research', exact: true }).click();
  await page.getByText('Research saved.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Version history' }).click();
  await page.getByRole('button', { name: 'Restore version 1', exact: true }).click();
  await page.getByText('Restored version 1 as a new version.', { exact: true }).waitFor();
  assert.equal(await editor(page).inputValue(), '');
  assert.equal(state.workspaces.d1.version, 3);
  assert.equal(state.revisions.d1.length, 3);
  assert.match(state.dialogs[0], /all three tabs/);
});

test('paginates deliverables and history, and retries a history failure', async t => {
  const { page, state } = await setup(t, { seed: true, paged: true, failHistoryOnce: true });
  await editor(page).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Research deliverable' }).locator('option').count(), 3);
  const initial = state.revisions.d1[0];
  state.revisions.d1 = Array.from({ length: 12 }, (_, i) => ({ ...initial, version: i + 1 }));
  await page.getByRole('button', { name: 'Version history' }).click();
  await page.getByRole('button', { name: 'Retry history' }).click();
  await page.getByRole('button', { name: 'Load older versions' }).click();
  await page.getByRole('button', { name: 'Restore version 2', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Load older versions' }).count(), 0);
});

test('ignores a save response after switching to another deliverable', async t => {
  let finish;
  const { page, state } = await setup(t, { seed: true, holdWrite: async () => new Promise(resolve => { finish = resolve; }) });
  await editor(page).fill('Only deliverable one');
  const saving = page.waitForRequest(request => request.method() === 'PUT');
  await page.getByRole('button', { name: 'Save research', exact: true }).click();
  await saving;
  await page.getByRole('combobox', { name: 'Research deliverable' }).selectOption('d2');
  await page.getByRole('heading', { name: 'Research has not been started' }).waitFor();
  const saved = page.waitForResponse(response => response.request().method() === 'PUT');
  finish(); await saved;
  assert.equal(await page.getByText('Research saved.', { exact: true }).count(), 0);
  assert.equal(await editor(page).count(), 0);
  assert.equal(state.workspaces.d1.document.sections[0].content, 'Only deliverable one');
});

test('an older history response cannot replace history fetched after a save', async t => {
  let finish;
  let calls = 0;
  const { page } = await setup(t, { seed: true, holdHistory: async () => {
    calls += 1;
    if (calls === 1) await new Promise(resolve => { finish = resolve; });
  } });
  await editor(page).fill('New research');
  const oldRequest = page.waitForRequest('**/revisions?*');
  await page.getByRole('button', { name: 'Version history' }).click();
  await oldRequest;
  await page.getByRole('button', { name: 'Save research', exact: true }).click();
  await page.getByText('Research saved.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Version history' }).click();
  const history = page.getByRole('region', { name: 'Research version history' });
  await history.getByText(/Version 2 · Research edited/).waitFor();
  const oldResponse = page.waitForResponse('**/revisions?*'); finish(); await oldResponse;
  await history.getByText(/Version 2 · Research edited/).waitFor();
});

test('ignores a late read after switching projects', async t => {
  let finish;
  const { page } = await setup(t, { seed: true, holdRead: async id => id === 'd2' ? new Promise(resolve => { finish = resolve; }) : undefined });
  await editor(page).waitFor();
  const pending = page.waitForRequest('**/deliverables/d2');
  await page.getByRole('combobox', { name: 'Research deliverable' }).selectOption('d2');
  await pending;
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('p2');
  await page.getByRole('combobox', { name: 'Research deliverable' }).selectOption('d3');
  await page.getByRole('heading', { name: 'Research has not been started' }).waitFor();
  const stale = page.waitForResponse('**/deliverables/d2'); finish(); await stale;
  assert.equal(await page.getByRole('combobox', { name: 'Research deliverable' }).inputValue(), 'd3');
  assert.equal(await editor(page).count(), 0);
});

test('revoking the flag or signing out removes research and unsaved content', async t => {
  const { page, state } = await setup(t, { seed: true });
  await editor(page).fill('Private unsaved draft');
  state.enabled = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('tab', { name: 'Research', exact: true }).waitFor({ state: 'detached' });
  assert.equal(await editor(page).count(), 0);
  state.enabled = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  await editor(page).waitFor();
  assert.equal(await editor(page).inputValue(), '');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  assert.equal(await editor(page).count(), 0);
});

test('empty projects show a useful message without research requests', async t => {
  const { page, state } = await setup(t, { empty: true });
  await page.getByText('No deliverables are available for this project. Ask your PM to create or release an assignment.').waitFor();
  assert.equal(state.calls.some(call => call.path.includes('/research/')), false);
});

test('manual editor fits a narrow screen and renders source links safely', async t => {
  const { page, state } = await setup(t, { seed: true, viewport: { width: 375, height: 812 } });
  await editor(page).waitFor();
  state.workspaces.d1.document.sections[0].content = 'Prior interviews suggest that evidence quality matters more than volume.';
  state.workspaces.d1.document.sections[0].sourceIds = ['s1'];
  state.workspaces.d1.document.sources = [{ id: 's1', title: 'Synthetic interview notes', url: 'https://example.test/notes' }];
  await page.getByRole('button', { name: 'Reload saved research' }).click();
  const source = page.getByRole('link', { name: 'Synthetic interview notes' });
  await source.waitFor();
  assert.equal(await source.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: path.join(__dirname, '../build/agentic-research-browser/preview.png'), fullPage: true });
});
