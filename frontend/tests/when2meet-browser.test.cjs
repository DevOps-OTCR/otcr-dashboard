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

async function setup(t, members, slots, width = 1440, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: options.height ?? 1000 },
    hasTouch: options.touch ?? false, isMobile: options.touch ?? false });
  t.after(() => context.close());
  const detail = { ...responseFor('/when2meet/polls/poll-1', 'PM'), members, slots, teamSize: members.length };
  if (options.grid) detail.grid = options.grid;
  const writes = [];
  await context.route('http://when2meet.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/')) {
      if (route.request().method() === 'PUT') writes.push(route.request().postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(
        path.startsWith('/api/when2meet/polls/poll-1') ? detail : responseFor(path.slice(4), 'PM')) });
    }
    return route.fulfill({ contentType: path === '/bundle.js' ? 'text/javascript' : 'text/html', body: path === '/bundle.js' ? bundle :
      document.replace('<html>', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>') });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto('http://when2meet.test/when2meet');
  await page.locator('[data-group-slot="0"]').waitFor();
  await page.addStyleTag({ content: styles });
  const popup = page.getByRole('region', { name: 'Time slot availability' });
  return { page, writes, popup,
    hover: async slot => {
      await page.locator(`[data-group-slot="${slot}"]`).hover();
      await page.waitForFunction(slot => document.querySelector(`[data-group-slot="${slot}"]`)?.hasAttribute('aria-describedby'), slot);
      await popup.waitFor({ state: 'visible' });
    } };
}
const member = (id, displayName) => ({ id, displayName, email: `${id}@example.test` });
const alex = member('alex', 'Alex Lee'), otherAlex = member('other-alex', 'Alex Lee'), casey = member('casey', 'Casey Morgan');

test('slot details and accessible labels include quarter-hour times when axis labels are blank', async t => {
  const grid = { ...responseFor('/when2meet/polls/poll-1', 'PM').grid,
    numCols: 2, numRows: 8, totalSlots: 16, slotStartMinute: 720, slotEndMinute: 840,
    gridFirstDate: '2026-10-11', gridLastDate: '2026-10-12', columnLabels: ['Sun, 10/11', 'Mon, 10/12'],
    rowStartLabels: ['12:00 PM', '', '', '', '1:00 PM', '', '', ''] };
  const { page, popup, hover } = await setup(t, [alex], [], 1440, { grid });
  for (const [slot, label] of [[0, 'Sun, 10/11, 12:00 PM'], [1, 'Sun, 10/11, 12:15 PM'],
    [2, 'Sun, 10/11, 12:30 PM'], [3, 'Sun, 10/11, 12:45 PM'], [6, 'Sun, 10/11, 1:30 PM'],
    [10, 'Mon, 10/12, 12:30 PM']]) {
    await hover(slot);
    assert.equal(await popup.locator('.w2m-slot-label').textContent(), label);
    assert.equal(await page.locator(`[data-group-slot="${slot}"]`).getAttribute('aria-label'), `${label}: 0 of 1 available`);
  }
});

test('touch selection in a full-day poll keeps details on screen and can be closed', async t => {
  const grid = { ...responseFor('/when2meet/polls/poll-1', 'PM').grid,
    numRows: 32, totalSlots: 32, slotEndMinute: 1020,
    rowStartLabels: Array.from({ length: 32 }, (_, i) => `${9 + Math.floor(i / 4)}:${String(i % 4 * 15).padStart(2, '0')}`) };
  const { page, popup } = await setup(t, [alex], [], 375, { height: 667, touch: true, grid });
  const lastSlot = page.locator('[data-group-slot="31"]');
  await lastSlot.tap();
  await popup.waitFor({ state: 'visible' });
  const bounds = await popup.boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 667, 'selected slot details must be inside the viewport');
  await popup.getByRole('button', { name: 'Close availability details' }).tap();
  await popup.waitFor({ state: 'hidden' });
  assert.equal(await lastSlot.evaluate(element => element === document.activeElement), true);
});

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
  await popup.getByText('No one unavailable.', { exact: true }).waitFor({ state: 'visible' });
  await hover(1);
  assert.equal(await popup.getByText('Unavailable (2)', { exact: true }).isVisible(), true);
  await popup.getByText('No one available.', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await popup.getByText(/No availability recorded/).count(), 0);
});

test('no saved slots are reported as unrecorded, including an empty team', async t => {
  for (const members of [[casey], []]) {
    const { page, popup } = await setup(t, members, []);
    await page.locator('[data-group-slot="0"]').focus();
    await popup.waitFor({ state: 'visible' });
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
      const body = element.querySelector('.w2m-availability-body');
      return { sections, left: bounds.left, right: bounds.right, horizontalOverflow: element.scrollWidth > element.clientWidth,
        scrolls: body.scrollHeight > body.clientHeight };
    });
    assert.ok(layout.left >= 0 && layout.right <= width);
    assert.equal(layout.horizontalOverflow, false);
    assert.equal(layout.scrolls, true);
    assert.equal(Math.abs(layout.sections[0].top - layout.sections[1].top) < 2, width > 480);
    // Enter the visible top; centering a tall popup can scroll the page and dismiss it first.
    await popup.hover({ position: { x: 12, y: 12 } });
    await popup.locator('.w2m-availability-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.equal(await popup.evaluate(element => {
      const header = element.querySelector('.w2m-availability-header');
      return element.querySelector('.w2m-availability-body').getBoundingClientRect().top >= header.getBoundingClientRect().bottom;
    }), true, 'scrolling list must stay below the header');
    assert.equal(await popup.locator('li').last().isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
}

test('older names-only cached responses do not invent unavailable identities', async t => {
  const { popup, hover } = await setup(t, [alex, otherAlex], [{ slotIndex: 0, names: ['Alex Lee'] }]);
  await hover(0);
  await popup.getByText('Refresh the page to load full availability details.').waitFor({ state: 'visible' });
  assert.equal(await popup.locator('li').count(), 0);
});

for (const [width, height] of [[375, 667], [667, 375], [899, 520], [901, 520], [1440, 600]]) {
  test(`details stay clear of the navbar at ${width}x${height} while scrolling and resizing`, async t => {
    const members = Array.from({ length: 40 }, (_, i) => member(`member-${i}`, `Consultant ${i} ${'LongName'.repeat(4)}`));
    const { page, popup } = await setup(t, members, [
      { slotIndex: 0, names: [], userIds: members.slice(0, 20).map(m => m.id) },
    ], width, { height });
    const clearOfNavbar = async label => {
      const layout = await popup.evaluate(element => {
        const navbar = document.querySelector('header').getBoundingClientRect();
        const bounds = element.getBoundingClientRect();
        const covered = document.elementFromPoint(navbar.left + navbar.width / 2, navbar.bottom - 2);
        const body = element.querySelector('.w2m-availability-body').getBoundingClientRect();
        return { navbarBottom: navbar.bottom, top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right,
          bodyHeight: Math.min(body.bottom, bounds.bottom) - body.top,
          coversNavbar: element.contains(covered), horizontalOverflow: element.scrollWidth > element.clientWidth };
      });
      const viewport = page.viewportSize();
      assert.equal(layout.coversNavbar, false, `${label}: navbar must stay on top`);
      if (viewport.width <= 900) {
        assert.ok(layout.top >= layout.navbarBottom - 0.5, `${label}: details must start below the navbar`);
        assert.ok(layout.bottom <= viewport.height, `${label}: details must stay inside the viewport`);
        assert.ok(layout.bodyHeight >= 40, `${label}: names must still have room to scroll (${layout.bodyHeight}px)`);
      }
      assert.ok(layout.left >= 0 && layout.right <= viewport.width, `${label}: details must not overflow horizontally`);
      assert.equal(layout.horizontalOverflow, false);
    };
    await page.locator('[data-group-slot="0"]').focus();
    await popup.waitFor({ state: 'visible' });
    await clearOfNavbar('opened');
    for (const y of [0, 200, 10000]) {
      await page.evaluate(y => scrollTo(0, y), y);
      await clearOfNavbar(`scrolled to ${y}`);
    }
    // Narrowing wraps the navbar links onto more rows, so the details must shrink to stay below them.
    await page.setViewportSize({ width: Math.max(320, width - 300), height });
    await clearOfNavbar('resized narrower');
    await page.setViewportSize({ width, height });
    await clearOfNavbar('resized back');
  });
}
