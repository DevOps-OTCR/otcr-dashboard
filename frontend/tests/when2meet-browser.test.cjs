const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildBundle, buildStyles, document } = require('./navigation-browser/bundle.cjs');
const { responseFor } = require('./navigation-browser/fixtures.cjs');
let browser, bundle, styles;
before(async () => {
  bundle = await buildBundle();
  styles = await buildStyles();
  browser = await chromium.launch({ headless: true,
    ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}) });
});
after(() => browser?.close());

async function setup(t, members, slots, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  t.after(() => context.close());
  const detail = { ...responseFor('/when2meet/polls/poll-1', 'PM'), members, slots, teamSize: members.length };
  const writes = [];
  await context.route('http://when2meet.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/')) {
      if (route.request().method() === 'PUT') writes.push(route.request().postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(
        path.startsWith('/api/when2meet/polls/poll-1') ? detail : responseFor(path.slice(4), 'PM')) });
    }
    return route.fulfill({ contentType: path === '/bundle.js' ? 'text/javascript' : 'text/html', body: path === '/bundle.js' ? bundle : document });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto('http://when2meet.test/when2meet');
  await page.locator('[data-group-slot="0"]').waitFor();
  await page.addStyleTag({ content: styles });
  return { page, writes, popup: page.getByRole('region', { name: 'Time slot availability' }),
    hover: slot => page.locator(`[data-group-slot="${slot}"]`).hover() };
}
const member = (id, displayName) => ({ id, displayName, email: `${id}@example.test` });
const alex = member('alex', 'Alex Lee'), otherAlex = member('other-alex', 'Alex Lee'), casey = member('casey', 'Casey Morgan');

test('hover moves both lists together, separates missing records, and distinguishes duplicate names by email', async t => {
  const { page, popup, hover, writes } = await setup(t, [alex, otherAlex, casey, alex], [
    { slotIndex: 0, names: ['Alex Lee'], userIds: ['alex', 'alex', 'former'] },
    { slotIndex: 1, names: ['Alex Lee'], userIds: ['other-alex'] },
  ]);
  await hover(0);
  const available = popup.getByRole('region', { name: 'Available', exact: true });
  const unavailable = popup.getByRole('region', { name: 'Unavailable', exact: true });
  assert.deepEqual(await available.locator('li').allTextContents(), ['Alex Leealex@example.test']);
  assert.deepEqual(await unavailable.locator('li').allTextContents(), ['Alex Leeother-alex@example.test']);
  assert.equal(await popup.getByText('No availability recorded (1)').isVisible(), true);
  await hover(1);
  assert.deepEqual(await available.locator('li').allTextContents(), ['Alex Leeother-alex@example.test']);
  assert.deepEqual(await unavailable.locator('li').allTextContents(), ['Alex Leealex@example.test']);
  // Moving into the popup leaves it open so larger lists can be scrolled.
  await popup.hover();
  assert.equal(await popup.isVisible(), true);
  await page.getByRole('heading', { name: 'Planning poll' }).hover();
  assert.equal(await popup.isVisible(), false);
  // Existing click/drag availability saving still sends the selected slots.
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'PUT'),
    page.locator('.w2m-left-cal [data-slot="1"]').click(),
  ]);
  assert.deepEqual(writes, [{ slots: [0, 1] }]);
});

test('everyone available and no one available have correct counts and empty states', async t => {
  const { popup, hover } = await setup(t, [alex, casey], [
    { slotIndex: 0, names: ['Alex Lee', 'Casey Morgan'], userIds: ['alex', 'casey'] },
  ]);
  await hover(0);
  assert.equal(await popup.getByText('Available (2)', { exact: true }).isVisible(), true);
  assert.equal(await popup.getByText('No one unavailable.', { exact: true }).isVisible(), true);
  await hover(1);
  assert.equal(await popup.getByText('Unavailable (2)', { exact: true }).isVisible(), true);
  assert.equal(await popup.getByText('No one available.', { exact: true }).isVisible(), true);
  assert.equal(await popup.getByText(/No availability recorded/).count(), 0);
});

test('no saved slots are reported as unrecorded, including an empty team', async t => {
  for (const members of [[casey], []]) {
    const { page, popup } = await setup(t, members, []);
    await page.locator('[data-group-slot="0"]').focus();
    assert.equal(await popup.getByText('Available (0)', { exact: true }).isVisible(), true);
    assert.equal(await popup.getByText('Unavailable (0)', { exact: true }).isVisible(), true);
    assert.equal(await popup.getByRole('region', { name: 'No availability recorded' }).count(), members.length ? 1 : 0);
    await page.keyboard.press('Escape');
    assert.equal(await popup.isVisible(), false);
  }
});

for (const width of [375, 768, 1024, 1440]) {
  test(`long lists fit and scroll at ${width}px with readable availability columns`, async t => {
    const members = Array.from({ length: 40 }, (_, i) => member(`member-${i}`, `Consultant ${i} ${'LongName'.repeat(8)}`));
    const { page, popup, hover } = await setup(t, members, [
      { slotIndex: 0, names: [], userIds: members.slice(0, 20).map(m => m.id) },
      { slotIndex: 1, names: [], userIds: members.slice(20).map(m => m.id) },
    ], width);
    await hover(0);
    assert.equal(await popup.locator('li').count(), 40);
    const layout = await popup.evaluate(element => {
      const sections = [...element.querySelector('.w2m-availability-columns').children].map(child => child.getBoundingClientRect().toJSON());
      const bounds = element.getBoundingClientRect();
      return { sections, left: bounds.left, right: bounds.right, horizontalOverflow: element.scrollWidth > element.clientWidth,
        scrolls: element.scrollHeight > element.clientHeight };
    });
    assert.ok(layout.left >= 0 && layout.right <= width);
    assert.equal(layout.horizontalOverflow, false);
    assert.equal(layout.scrolls, true);
    assert.equal(Math.abs(layout.sections[0].top - layout.sections[1].top) < 2, width > 480);
    await popup.hover();
    await popup.evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.equal(await popup.locator('li').last().isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
}

test('older names-only cached responses do not invent unavailable identities', async t => {
  const { popup, hover } = await setup(t, [alex, otherAlex], [{ slotIndex: 0, names: ['Alex Lee'] }]);
  await hover(0);
  assert.equal(await popup.getByText('Refresh the page to load full availability details.').isVisible(), true);
  assert.equal(await popup.locator('li').count(), 0);
});
