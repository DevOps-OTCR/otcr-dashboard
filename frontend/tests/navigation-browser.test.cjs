const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildBundle, buildStyles, document } = require('./navigation-browser/bundle.cjs');
const { responseFor } = require('./navigation-browser/fixtures.cjs');
let browser, bundle, styles;

// Use Playwright's bundled Chromium unless a browser channel is explicitly selected.
before(async () => {
  bundle = await buildBundle();
  styles = await buildStyles();
  browser = await chromium.launch({
    ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}),
    headless: true,
  });
});
after(() => browser?.close());

async function setup(t, initialPath, role = 'PM') {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.route('https://calendar.google.com/**', route => {
    state.calendarLoads += 1;
    return route.fulfill({ contentType: 'text/html', body: '<p>Calendar fixture</p>' });
  });
  await context.route('http://navigation.test/**', route => route.fulfill({
    contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html',
    body: route.request().url().endsWith('/bundle.js') ? bundle : document,
  }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  const state = { calls: [], gate: null, failSprints: false, slowGate: null, calendarLoads: 0, eventTitle: 'Team weekly check-in' };
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname.slice(4);
    state.calls.push(pathname);
    if (state.slowGate && pathname === '/slow-test') await state.slowGate;
    if (state.gate && pathname !== '/auth/role' && pathname !== '/notifications/my') await state.gate;
    if (pathname === '/test-write') state.eventTitle = 'Updated team check-in';
    const payload = responseFor(pathname, role);
    if (pathname === '/attendance/events') payload.events = payload.events.map(event => ({ ...event, title: state.eventTitle }));
    const failed = state.failSprints && pathname.endsWith('/sprints');
    await route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(failed ? { message: 'Temporary outage' } : payload) });
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
  await page.clock.install({ time: new Date() });
  await page.clock.fastForward(121000);
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
  let releaseSlow;
  state.slowGate = new Promise(resolve => { releaseSlow = resolve; });
  const slowRequest = page.waitForRequest('**/api/slow-test');
  await page.evaluate(() => { window.pendingResource = Promise.all([window.navigationTest.request(), window.navigationTest.request()]); });
  // Ensure the shared request is in flight before the write invalidates it.
  await slowRequest;
  await page.evaluate(() => window.navigationTest.write().then(() => true));
  releaseSlow();
  await page.evaluate(() => window.pendingResource.then(() => true));
  assert.equal(state.calls.filter(path => path === '/slow-test').length, 1);
  assert.equal(await page.evaluate(() => window.navigationTest.readResource('/slow-test')), undefined);
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await nav('Attendance').click();
  await page.getByRole('status').waitFor();
  assert.equal(await page.getByText('Team weekly check-in', { exact: true }).count(), 0);
  assert.equal(await nav('Slides').isVisible(), true);
  release();
  await page.getByText('Updated team check-in', { exact: true }).waitFor();
  const key = JSON.stringify(['attendance', 'pm@example.test', null]);
  await page.waitForFunction(key => Boolean(window.navigationTest.readSnapshot(key)), key);
  assert.ok(await page.evaluate(() => window.navigationTest.readResource('/attendance/events')));
  // Hold the new account's refresh so it cannot refill the cache before this check.
  let releaseAccountRefresh;
  state.gate = new Promise(resolve => { releaseAccountRefresh = resolve; });
  const accountRefresh = page.waitForRequest('**/api/attendance/events');
  await page.evaluate(() => window.navigationTest.switchAccount('other@example.test'));
  await accountRefresh;
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), key), undefined);
  assert.equal(await page.evaluate(() => window.navigationTest.readResource('/attendance/events')), undefined);
  const activeKey = JSON.stringify(['attendance', 'other@example.test', null]);
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), activeKey), undefined);
  releaseAccountRefresh();
  await page.getByText('Updated team check-in', { exact: true }).waitFor();
  await page.waitForFunction(key => Boolean(window.navigationTest.readSnapshot(key)), activeKey);
  assert.ok(await page.evaluate(() => window.navigationTest.readResource('/attendance/events')));
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await page.getByText('Updated team check-in', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), activeKey), undefined);
  assert.equal(await page.evaluate(key => window.navigationTest.readSnapshot(key), key), undefined);
  assert.equal(await page.evaluate(() => window.navigationTest.readResource('/attendance/events')), undefined);
});


test('managers create drafts with separate multi-person assignment sets', async t => {
  const { page, open } = await setup(t, '/workstream');
  await page.route('**/api/projects/team-1?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    pm: { id: 'u-1', firstName: 'Test PM' }, members: [{ user: { id: 'u-2', firstName: 'Casey' } }],
  }) }));
  const creations = [];
  await page.route('**/api/deliverables', route => {
    creations.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await open();
  await page.getByPlaceholder('- Add week function\n- Get it hosted\n- Redesign deliverables').fill('- Shared work\n- Unassigned work');
  const shared = page.getByRole('group', { name: 'Assignees for Shared work', exact: true });
  await shared.getByRole('checkbox', { name: 'Test PM', exact: true }).check();
  await shared.getByRole('checkbox', { name: 'Casey', exact: true }).check();
  await page.getByRole('button', { name: 'Save Deliverables', exact: true }).click();
  await page.getByText('Draft deliverables saved', { exact: true }).waitFor();
  assert.deepEqual(creations.map(item => [item.title, item.assigneeIds]), [['Shared work', ['u-1', 'u-2']], ['Unassigned work', []]]);
});

test('assignment editor preselects everyone, saves a complete set, and retains selections after failure', async t => {
  const { page, open } = await setup(t, '/deliverables');
  const users = [{ id: 'u-1', firstName: 'Test PM' }, { id: 'u-2', firstName: 'Casey' }, { id: 'u-3', firstName: 'Riley' }];
  await page.route('**/api/projects/team-1?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    pm: users[0], members: users.slice(1).map(user => ({ user })),
  }) }));
  await page.route('**/api/projects/*/sprints', route => {
    const payload = responseFor('/projects/team-1/sprints', 'PM');
    payload[0].deliverables[0].assignees = users.slice(0, 2);
    payload[0].deliverables[0].submissions = [{ id: 's-1', fileUrl: 'https://example.test/submission', submittedAt: '2026-10-12', submitter: users[0] }];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
  const saves = [];
  let fail = false;
  await page.route('**/api/deliverables/*/assignments', route => {
    const ids = route.request().postDataJSON().assigneeIds;
    saves.push(ids);
    return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(fail ? { message: 'Save failed; try again' } : users.filter(user => ids.includes(user.id))) });
  });
  await open();
  const group = page.getByRole('group', { name: 'Assignees', exact: true });
  assert.equal(await group.getByRole('checkbox', { name: 'Test PM' }).isChecked(), true);
  assert.equal(await group.getByRole('checkbox', { name: 'Casey' }).isChecked(), true);
  await group.getByRole('checkbox', { name: 'Test PM' }).uncheck();
  await group.getByRole('checkbox', { name: 'Riley' }).check();
  await page.getByRole('button', { name: 'Save assignees', exact: true }).click();
  await page.getByText('Assignees saved', { exact: true }).waitFor();
  assert.deepEqual(saves, [['u-2', 'u-3']]);
  assert.equal(await page.getByText('Casey, Riley', { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('link', { name: /submission/i }).count() > 0, true);
  fail = true;
  await group.getByRole('checkbox', { name: 'Casey' }).uncheck();
  await page.getByRole('button', { name: 'Save assignees', exact: true }).click();
  await page.getByText('Save failed; try again', { exact: true }).waitFor();
  assert.equal(await group.getByRole('checkbox', { name: 'Casey' }).isChecked(), false);
  assert.equal(await page.getByText('Casey, Riley', { exact: true }).isVisible(), true);
  fail = false;
  await group.getByRole('checkbox', { name: 'Riley' }).uncheck();
  await page.getByRole('button', { name: 'Save assignees', exact: true }).click();
  await page.getByText('Unassigned', { exact: true }).first().waitFor();
  assert.deepEqual(saves.at(-1), []);
});


test('Workstream and W2M restore selected content while expired resources refresh', async t => {
  const { page, state, nav, open } = await setup(t, '/workstream');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await page.locator('main select').first().selectOption('team-2');
  await page.getByText('team-2 Research', { exact: true }).waitFor();
  await nav('When2Meet').click();
  await page.getByText('Monday', { exact: true }).first().waitFor();
  await nav('Attendance').click();
  await page.getByText('Team weekly check-in', { exact: true }).waitFor();
  await page.clock.install({ time: new Date() });
  await page.clock.fastForward(121000);
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await nav('Workstream').click();
  await page.getByText('team-2 Research', { exact: true }).waitFor();
  assert.equal(await page.locator('main select').first().inputValue(), 'team-2');
  assert.equal(await page.getByRole('status').count(), 0);
  await nav('When2Meet').click();
  await page.getByText('Monday', { exact: true }).first().waitFor();
  assert.equal(await page.locator('main select').nth(1).inputValue(), 'poll-1');
  assert.equal(await page.getByRole('status').count(), 0);
  release();
});

test('Overview shares sprint requests and retains the calendar across routes and failed refreshes', async t => {
  const { page, state, nav, open } = await setup(t, '/pm');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  const iframe = page.locator('iframe');
  await iframe.waitFor();
  await page.evaluate(() => { window.originalCalendar = document.querySelector('iframe'); window.originalNavbar = document.querySelector('nav'); });
  await page.waitForFunction(() => Boolean(document.querySelector('iframe')?.contentWindow));
  const calendarUrl = await iframe.getAttribute('src');
  assert.ok(calendarUrl.includes('team-1%40example.test'));
  await nav('Workstream').click();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  assert.equal(await iframe.isVisible(), false);
  assert.equal(state.calls.filter(path => path === '/projects/team-1/sprints').length, 1);
  await page.clock.install({ time: new Date() });
  await page.clock.fastForward(121000);
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  await nav('Overview').click();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  assert.equal(await page.getByRole('status').count(), 0);
  assert.equal(await page.evaluate(() => document.querySelector('iframe') === window.originalCalendar && document.querySelector('nav') === window.originalNavbar), true);
  assert.equal(await iframe.getAttribute('src'), calendarUrl);
  state.failSprints = true;
  release();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByText('team-1 Research', { exact: true }).isVisible(), true);
  state.gate = null;
  state.failSprints = false;
  for (const path of ['/lc', '/partner', '/consultant']) {
    await page.evaluate(path => window.navigationTest.navigate(path), path);
    await page.getByText('team-1 Draft deck', { exact: true }).waitFor();
    assert.equal(await iframe.isVisible(), true);
    assert.equal(await page.evaluate(() => document.querySelector('iframe') === window.originalCalendar), true);
  }
  assert.equal(state.calendarLoads, 1);
});

test('Pages trailing-slash routes keep the navbar and overview calendar', async t => {
  const { page, nav, open } = await setup(t, '/pm/');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  assert.equal(await nav('Workstream').isVisible(), true);
  assert.equal(await page.locator('iframe').isVisible(), true);
  await page.evaluate(() => window.navigationTest.navigate('/when2meet/'));
  await page.getByText('Monday', { exact: true }).first().waitFor();
  assert.equal(await nav('When2Meet').isVisible(), true);
  assert.match(await nav('When2Meet').getAttribute('class'), /text-\[var\(--primary\)\]/);
});

test('Light/Dark toggle persists and syncs without replacing icons or reloading the calendar', async t => {
  const { page, state, open } = await setup(t, '/pm');
  await open();
  await page.getByText('team-1 Research', { exact: true }).waitFor();
  await page.locator('iframe').waitFor();
  await page.evaluate(() => {
    window.themeIcons = Array.from(document.querySelector('button[aria-label="Switch to dark mode"]').querySelectorAll('svg'));
    window.themeCalendar = document.querySelector('iframe');
  });
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  assert.equal(await page.getByRole('button', { name: 'Switch to light mode', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('menu').count(), 0);
  assert.equal(await page.evaluate(() => {
    const icons = document.querySelector('button[aria-label="Switch to light mode"]').querySelectorAll('svg');
    return icons.length === 2 && Array.from(icons).every((icon, index) => icon === window.themeIcons[index])
      && document.querySelector('iframe') === window.themeCalendar;
  }), true);
  assert.equal(state.calendarLoads, 1);

  await page.reload();
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);

  const other = await page.context().newPage();
  await other.route('**/api/**', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify(responseFor(new URL(route.request().url()).pathname.slice(4), 'PM')) }));
  await other.goto('http://navigation.test/slides');
  await other.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('light'));

  // Reads can succeed while writes fail when browser storage is full.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  assert.equal(await page.getByRole('button', { name: 'Switch to light mode', exact: true }).isVisible(), true);
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`theme colors change together without intermediate low contrast (${reducedMotion})`, async t => {
    const { page, open } = await setup(t, '/when2meet');
    await page.emulateMedia({ reducedMotion });
    await open();
    await page.getByText('Monday', { exact: true }).first().waitFor();
    await page.addStyleTag({ content: styles });
    // Cover generated content as well as the real navbar and W2M transitions.
    await page.addStyleTag({ content: 'nav::before { content: ""; color: var(--foreground); background: var(--card); border: 1px solid var(--border); transition: all 0.5s; }' });
    await page.evaluate(() => {
      const targets = [document.body, document.querySelector('header'), document.querySelector('nav'),
        ...document.querySelectorAll('nav a'), document.querySelector('.w2mRoot p'), document.querySelector('.w2m-square')];
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      function rgb(color) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      }
      function blend(front, back) {
        const alpha = front[3] / 255;
        return front.slice(0, 3).map((value, i) => value * alpha + back[i] * (1 - alpha));
      }
      function background(element) {
        if (!element) return [255, 255, 255];
        return blend(rgb(getComputedStyle(element).backgroundColor), background(element.parentElement));
      }
      function luminance(color) {
        return color.map(value => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
      }
      window.sampleTheme = () => {
        const colors = targets.map(element => {
          const style = getComputedStyle(element);
          return [style.color, style.backgroundColor, style.borderTopColor];
        });
        const pseudo = getComputedStyle(document.querySelector('nav'), '::before');
        colors.push([pseudo.color, pseudo.backgroundColor, pseudo.borderTopColor]);
        const contrast = targets.slice(0, -1).map(element => {
          const bg = background(element);
          const fg = blend(rgb(getComputedStyle(element).color), bg);
          const a = luminance(fg), b = luminance(bg);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
        return { colors, contrast };
      };
    });

    for (const theme of ['dark', 'light']) {
      const samples = await page.evaluate(async theme => {
        document.querySelector(`button[aria-label="Switch to ${theme} mode"]`).click();
        const samples = [window.sampleTheme()];
        for (let frame = 0; frame < 35; frame++) {
          await new Promise(requestAnimationFrame);
          samples.push(window.sampleTheme());
        }
        return samples;
      }, theme);
      const final = samples.at(-1);
      for (const sample of samples) {
        assert.deepEqual(sample.colors, final.colors, `${theme} colors must match the final palette on every frame`);
        assert.ok(sample.contrast.every(ratio => ratio >= 4.5), `Text contrast must stay at least 4.5:1: ${sample.contrast}`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('theme-changing')), false);
      assert.notEqual(await page.locator('nav a').first().evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    }

    // A second tab's storage event uses the same atomic update path.
    const synced = await page.evaluate(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
      return window.sampleTheme();
    });
    const rapid = await page.evaluate(() => {
      for (let i = 0; i < 4; i++) document.querySelector('button[aria-label^="Switch to"]').click();
      return window.sampleTheme();
    });
    assert.deepEqual(rapid.colors, synced.colors);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('theme-changing')), false);
  });
}
