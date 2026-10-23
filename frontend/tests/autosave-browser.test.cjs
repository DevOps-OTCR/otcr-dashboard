const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildBundle, buildStyles, document } = require('./navigation-browser/bundle.cjs');
const { createApi } = require('./autosave-browser/fixtures.cjs');
let browser, bundle, styles;
before(async () => {
  bundle = await buildBundle(); styles = await buildStyles();
  browser = await chromium.launch({ headless: true, ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}) });
});
after(() => browser?.close());
async function setup(t, path = '/workstream', prepare = () => {}) {
  const api = createApi(); prepare(api);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'America/Chicago' });
  t.after(() => context.close());
  await context.route('http://autosave.test/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.startsWith('/api/')) {
      const result = await api.request(path.slice(4), request.method(), request.postData() ? request.postDataJSON() : undefined);
      await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.data) });
    } else await route.fulfill({ contentType: path === '/bundle.js' ? 'text/javascript' : 'text/html', body: path === '/bundle.js' ? bundle : document });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.clock.install({ time: new Date('2026-10-23T18:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-23T18:00:01Z'));
  await page.goto(`http://autosave.test${path}`);
  await page.addStyleTag({ content: styles });
  await page.getByRole('link', { name: 'Teams', exact: true }).waitFor();
  if (path === '/workstream') await page.getByLabel('General Notes / Links', { exact: true }).waitFor();
  if (path === '/deliverables') await page.locator('[data-autosave="deliverable:team-1-1-research:deadline"]').waitFor();
  return { api, page, field: id => page.locator(`[data-autosave="${id}"]`) };
}
const pause = page => page.clock.runFor(700);
async function saved(field) { await field.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor(); }
const patch = r => r.method === 'PATCH';

test('notes: no initial write, debounce, early blur, clearing and real reload persistence', async t => {
  const { page, api, field } = await setup(t);
  const notes = page.getByLabel('General Notes / Links', { exact: true });
  await page.clock.runFor(1000); assert.equal(api.writes.length, 0);
  await notes.fill('First'); await page.clock.runFor(500); await notes.fill('Latest notes');
  await page.clock.runFor(649); assert.equal(api.writes.length, 0);
  await page.clock.runFor(1); await saved(field('sprint:team-1-week-1:notes'));
  assert.deepEqual(api.writes.map(r => r.body), [{ generalNotes: 'Latest notes' }]);
  await notes.fill('Blur saves'); await notes.blur(); await saved(field('sprint:team-1-week-1:notes'));
  await notes.fill(''); await notes.blur(); await saved(field('sprint:team-1-week-1:notes'));
  assert.equal(api.weeks['team-1'][0].configSnapshot.generalNotes, '');
  await page.reload(); await notes.waitFor(); assert.equal(await notes.inputValue(), '');
  assert.equal(api.writes.length, 3);
});

test('slow save never overwrites newer notes or shows Saved early; failures keep drafts and retry', async t => {
  const { page, api, field } = await setup(t);
  const notes = page.getByLabel('General Notes / Links', { exact: true }), status = field('sprint:team-1-week-1:notes');
  const hold = api.holdNext(patch);
  await notes.fill('First request'); await pause(page); await hold.waiting;
  await notes.fill('Second request'); await pause(page);
  assert.equal(api.writes.length, 1); assert.notEqual(await status.getByRole('status').textContent(), 'Saved');
  hold.release(); await saved(status); assert.equal(await notes.inputValue(), 'Second request');
  assert.deepEqual(api.writes.map(r => r.body.generalNotes), ['First request', 'Second request']);
  api.failNext(r => r.path.endsWith('/notes'));
  await notes.fill('Keep after failure'); await pause(page); await status.getByRole('button', { name: 'Retry' }).waitFor();
  assert.equal(await notes.inputValue(), 'Keep after failure');
  await status.getByRole('button', { name: 'Retry' }).click(); await saved(status);
  assert.equal(api.weeks['team-1'][0].configSnapshot.generalNotes, 'Keep after failure');
});

test('week/date commits validate and serialize with manual deadline overrides', async t => {
  const { page, api, field } = await setup(t);
  const week = page.getByLabel('Workstream Week Start', { exact: true });
  assert.equal(await page.getByText('10/12/2026 - 10/18/2026', { exact: true }).isVisible(), true);
  await week.fill('0026-10-23'); await week.blur(); await pause(page); assert.equal(api.writes.length, 0);
  await week.fill('2026-10-12'); await week.blur();
  const manual = field('deliverable:team-1-1-research:deadline');
  await manual.locator('input').fill('2026-11-03T18:00'); await manual.locator('input').blur(); await saved(manual);
  const hold = api.holdNext(r => r.path.endsWith('/team-1-week-1'));
  await week.fill('2026-10-26'); await page.clock.runFor(1000);
  assert.equal(api.writes.length, 1, 'date must wait for commit');
  await week.blur(); await hold.waiting;
  const other = field('deliverable:team-1-1-analysis:deadline');
  await other.locator('input').fill('2026-11-04T09:30'); await other.locator('input').blur();
  assert.equal(api.writes.length, 2, 'deadline waits for week update');
  hold.release(); await saved(other); await saved(field('sprint:team-1-week-1:weekStartDate'));
  assert.equal(await page.getByText('10/26/2026 - 11/1/2026', { exact: true }).isVisible(), true);
  const [research, analysis] = api.weeks['team-1'][0].deliverables;
  assert.equal(research.deadline, '2026-11-04T00:00:00.000Z');
  assert.equal(analysis.deadline, '2026-11-04T15:30:00.000Z');
  assert.equal(research.dueDateSource, 'MANUAL');
  assert.equal(await manual.locator('input').inputValue(), '2026-11-03T18:00');
});

test('project/week changes flush original IDs and in-app navigation waits; failed save blocks switching', async t => {
  const { page, api, field } = await setup(t);
  const notes = page.getByLabel('General Notes / Links', { exact: true });
  await notes.fill('Old week draft');
  await page.getByLabel('Workstream week', { exact: true }).selectOption('team-1-week-2');
  await page.waitForFunction(() => document.querySelector('[aria-label="General Notes / Links"]')?.value === 'Team One notes 2');
  assert.equal(api.weeks['team-1'][0].configSnapshot.generalNotes, 'Old week draft');
  await notes.fill('Original project'); await page.getByLabel('Project', { exact: true }).selectOption('team-2');
  await page.waitForFunction(() => document.querySelector('[aria-label="General Notes / Links"]')?.value === 'Team Two notes 1');
  assert.equal(api.weeks['team-1'][1].configSnapshot.generalNotes, 'Original project');
  api.failNext(r => r.path.endsWith('/notes'));
  await notes.fill('Keep here');
  // selectOption does not blur the textarea like a mouse does, ensuring this tests the context gate itself.
  await page.getByLabel('Project', { exact: true }).selectOption('team-1');
  await field('sprint:team-2-week-1:notes').getByRole('button', { name: 'Retry' }).waitFor();
  assert.equal(await page.getByLabel('Project', { exact: true }).inputValue(), 'team-2');
  const hold = api.holdNext(patch);
  await page.getByRole('link', { name: 'Deliverables', exact: true }).click(); await hold.waiting;
  assert.equal(new URL(page.url()).pathname, '/workstream');
  hold.release(); await page.waitForURL('**/deliverables');
  assert.equal(api.weeks['team-2'][0].configSnapshot.generalNotes, 'Keep here');
});

test('assignees coalesce rapid checks and two cards retain independent deadline edits', async t => {
  const { page, api, field } = await setup(t, '/deliverables');
  const assignments = field('deliverable:team-1-1-research:assignees');
  await assignments.getByLabel('Test PM').check(); await assignments.getByLabel('Alex Consultant').check();
  await assignments.getByLabel('Test PM').uncheck();
  await page.clock.runFor(249); assert.equal(api.writes.length, 0); await page.clock.runFor(1); await saved(assignments);
  assert.deepEqual(api.writes[0].body, { assigneeIds: ['u-2'] });
  const first = field('deliverable:team-1-1-research:deadline'), second = field('deliverable:team-1-1-analysis:deadline');
  await first.locator('input').fill('2026-10-30T12:00');
  await second.locator('input').fill('2026-10-31T13:00'); await second.locator('input').blur();
  await saved(first); await saved(second);
  assert.equal(await first.locator('input').inputValue(), '2026-10-30T12:00');
  assert.equal(await second.locator('input').inputValue(), '2026-10-31T13:00');
  await page.reload(); await first.locator('input').waitFor();
  assert.equal(await first.locator('input').inputValue(), '2026-10-30T12:00');
  assert.equal(await assignments.getByLabel('Alex Consultant').isChecked(), true);
});

test('subtask updates patch only changed fields; collapse, creation refresh and manual refresh preserve drafts', async t => {
  const { page, api, field } = await setup(t, '/deliverables');
  await page.getByRole('button', { name: /Subtasks/ }).nth(0).click();
  await page.getByRole('button', { name: /Subtasks/ }).nth(1).click();
  const title = field('subtask:team-1-1-research-task:title'), done = field('subtask:team-1-1-research-task:completed');
  const hold = api.holdNext(r => r.path.endsWith('/team-1-1-research-task'));
  await title.locator('input').fill('Investigate'); await pause(page); await hold.waiting;
  await done.getByLabel('Done').check(); await page.clock.runFor(1);
  hold.release(); await saved(done);
  assert.deepEqual(api.writes.slice(0, 2).map(r => r.body), [{ title: 'Investigate' }, { completed: true }]);
  const due = field('subtask:team-1-1-research-task:dueDate');
  await due.locator('input').fill('2026-10-25T15:00'); await due.locator('input').blur(); await saved(due);
  await due.locator('input').fill(''); await due.locator('input').blur(); await saved(due);
  assert.deepEqual(api.writes.at(-1).body, { dueDate: null });
  await page.getByLabel('New subtask title', { exact: true }).nth(0).fill('Keep new draft');
  const otherTitle = field('subtask:team-1-1-analysis-task:title');
  await otherTitle.locator('input').fill(''); await otherTitle.locator('input').blur();
  await page.getByLabel('New subtask title', { exact: true }).nth(1).fill('Create this one');
  await page.getByRole('button', { name: 'Add Subtask', exact: true }).nth(1).click();
  await page.getByText('Subtask added', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('New subtask title', { exact: true }).nth(0).inputValue(), 'Keep new draft');
  assert.equal(await otherTitle.locator('input').inputValue(), '');
  await page.getByRole('button', { name: /Subtasks/ }).nth(1).click();
  await page.getByRole('button', { name: /Subtasks/ }).nth(1).click();
  assert.equal(await otherTitle.locator('input').inputValue(), '');
  await page.getByRole('button', { name: 'Refresh page data' }).click();
  await page.getByRole('button', { name: /Subtasks/ }).nth(0).click();
  await page.getByRole('button', { name: /Subtasks/ }).nth(1).click();
  assert.equal(await page.getByLabel('New subtask title', { exact: true }).nth(0).inputValue(), 'Keep new draft');
  assert.equal(await otherTitle.locator('input').inputValue(), '');
});

test('team settings wait for async load, validate, patch individually and flush before changing teams', async t => {
  let hold;
  const { page, api, field } = await setup(t, '/teams', api => { hold = api.holdNext(r => r.path.endsWith('/sprint-config')); });
  await page.getByRole('button', { name: /Team One.*members/ }).click(); await hold.waiting;
  await page.clock.runFor(2000); assert.equal(api.writes.length, 0); assert.equal(await page.getByLabel('Timezone', { exact: true }).count(), 0);
  hold.release(); await page.getByLabel('Timezone', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Default due time', { exact: true }).inputValue(), '17:30');
  await page.clock.runFor(1000); assert.equal(api.writes.length, 0);
  await page.getByLabel('Timezone', { exact: true }).fill('Mars/Olympus'); await pause(page); assert.equal(api.writes.length, 0);
  await page.getByLabel('Timezone', { exact: true }).fill('America/New_York'); await pause(page); await saved(field('project:team-1:schedule:sprintTimezone'));
  assert.deepEqual(api.writes[0].body, { sprintTimezone: 'America/New_York' });
  await page.getByLabel('Sprint starts on').selectOption('FRIDAY'); await page.clock.runFor(1); await saved(field('project:team-1:schedule:sprintStartDay'));
  await page.getByLabel('Auto-generate weekly sprint templates for this team').check(); await page.clock.runFor(1); await saved(field('project:team-1:schedule:autoGenerateSprints'));
  const calendar = page.getByLabel('Google Calendar secret / ID', { exact: true });
  await calendar.fill('changed@example.test'); await page.clock.runFor(1000); assert.equal(api.writes.length, 3);
  await calendar.blur(); await saved(field('project:team-1:calendar'));
  await calendar.fill(''); await page.getByRole('button', { name: 'Back to teams' }).click();
  await page.getByRole('button', { name: /Team Two.*members/ }).click(); await page.getByLabel('Timezone', { exact: true }).waitFor();
  assert.equal(api.projects[0].googleCalendarId, null);
  assert.equal(await calendar.inputValue(), 'team-2@example.test');
  assert.equal(await page.getByLabel('Timezone', { exact: true }).inputValue(), 'America/Chicago');
});

test('beforeunload warns only with unsaved work and history unmount retains a failed draft', async t => {
  const { page, api, field } = await setup(t);
  const prevented = () => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
  assert.equal(await prevented(), false);
  await page.getByLabel('General Notes / Links', { exact: true }).fill('Unsaved'); assert.equal(await prevented(), true);
  await pause(page); await saved(field('sprint:team-1-week-1:notes')); assert.equal(await prevented(), false);
  api.failNext(r => r.path.endsWith('/notes'));
  await page.getByLabel('General Notes / Links', { exact: true }).fill('Keep after route unmount');
  await page.evaluate(() => window.navigationTest.navigate('/deliverables'));
  await page.getByRole('alert').getByText('Some edits haven’t saved. Keep this tab open.').waitFor();
  await page.getByRole('button', { name: 'Return to editor' }).click();
  await page.getByLabel('General Notes / Links', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('General Notes / Links', { exact: true }).inputValue(), 'Keep after route unmount');
});

test('an old refresh response arriving after a save cannot roll back the saved value', async t => {
  const { page, api, field } = await setup(t, '/deliverables');
  const hold = api.holdNext(r => r.method === 'GET' && r.path.endsWith('/sprints'));
  await page.getByRole('button', { name: 'Refresh page data' }).click(); await hold.waiting;
  const deadline = field('deliverable:team-1-1-research:deadline');
  await deadline.locator('input').fill('2026-11-05T14:30'); await deadline.locator('input').blur(); await saved(deadline);
  hold.release();
  await page.waitForResponse(response => response.request().method() === 'GET' && response.url().endsWith('/sprints'));
  await page.getByText('Due 11/5/2026, 2:30:00 PM', { exact: true }).waitFor();
  assert.equal(await deadline.locator('input').inputValue(), '2026-11-05T14:30');
  assert.equal(api.writes.length, 1);
});
