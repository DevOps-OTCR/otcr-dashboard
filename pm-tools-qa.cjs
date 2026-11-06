const fs = require('fs');
const path = require('path');
const H = path.join(process.cwd(), 'tests/navigation-browser');
const { buildBundle, buildStyles, document } = require(H + '/bundle.cjs');
const { responseFor } = require(H + '/fixtures.cjs');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd()] }));

const outDir = process.argv[2] || path.join(process.cwd(), 'demo-out');

const monday = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
})();

const iso = (dayOffset, hour) => {
  const d = new Date(monday.getTime());
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

let role = 'PM';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const errors = [];
  const bundle = await buildBundle({ outputName: 'pm-tools-qa' });
  const styles = await buildStyles();
  const browser = await chromium.launch({ headless: true, slowMo: 250 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
  });

  await context.route('http://navigation.test/**', route => {
    const url = route.request().url();
    const isBundle = url.endsWith('/bundle.js');
    return route.fulfill({
      contentType: isBundle ? 'text/javascript; charset=utf-8' : 'text/html',
      body: isBundle ? bundle : document,
    });
  });

  await context.route('https://calendar.google.com/**', route => {
    return route.fulfill({ contentType: 'text/html', body: '<p>Calendar</p>' });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message));

  await page.route('**/api/**', route => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname.slice(4);

    if (pathname === '/auth/role') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role }) });
    }

    if (pathname === '/projects') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        projects: [ { id: 'team-1', name: 'Team One' }, { id: 'team-2', name: 'Team Two' } ],
      }) });
    }

    if (pathname === '/projects/team-1/sprints') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 't1-w10', label: 'Week 10', status: 'RELEASED', weekStartDate: iso(0, 0), weekEndDate: iso(6, 0), deliverables: [
          { id: 'a', title: 'Market sizing research', deadline: iso(-3, 17), status: 'IN_PROGRESS', completed: false },
          { id: 'b', title: 'Client draft deck', deadline: iso(6, 21), status: 'IN_PROGRESS', completed: false },
          { id: 'c', title: 'Kickoff notes', deadline: iso(-2, 12), status: 'APPROVED', completed: true },
        ] },
        { id: 't1-w11', label: 'Week 11', status: 'DRAFT', weekStartDate: iso(7, 0), weekEndDate: iso(13, 0), deliverables: [] },
      ]) });
    }

    if (pathname === '/projects/team-2/sprints') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 't2-w10', label: 'Week 10', status: 'RELEASED', weekStartDate: iso(0, 0), weekEndDate: iso(6, 0), deliverables: [
          { id: 'd', title: 'Final presentation', deadline: iso(14, 18), status: 'PENDING', completed: false },
        ] },
      ]) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseFor(pathname, role)) });
  });

  const getCardTitle = async () => {
    const heading = page.getByRole('heading', { name: 'PM tools' });
    if (await heading.count()) return heading.first();
    return page.getByText('PM tools', { exact: true }).first();
  };

  role = 'PM';
  await page.goto('http://navigation.test/overview');
  await page.addStyleTag({ content: styles });
  const pmCard = page.getByText('PM tools', { exact: true }).first();
  await pmCard.waitFor();
  await pmCard.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '01-pm-sees-card.png'), fullPage: true });

  const cardText = await page.locator('body').innerText();
  for (const needle of ['1 overdue', '1 due this week', '1 unreleased sprint']) {
    if (!cardText.includes(needle)) errors.push(`PM view missing "${needle}"`);
  }
  if (!cardText.includes('Final presentation')) errors.push('PM view missing "Final presentation"');

  const linkChecks = [
    { name: 'Release sprints in Workstream', hrefEnd: '/workstream' },
    { name: 'Schedule an event', hrefEnd: null },
    { name: 'Find a meeting time', hrefEnd: null },
  ];
  for (const { name, hrefEnd } of linkChecks) {
    const link = page.getByRole('link', { name, exact: false });
    if (!(await link.count())) { errors.push(`Missing link: ${name}`); continue; }
    if (hrefEnd) {
      const href = await link.first().getAttribute('href');
      if (!href || !href.endsWith(hrefEnd)) errors.push(`Link "${name}" href "${href}" does not end with "${hrefEnd}"`);
    }
  }
  console.log(JSON.stringify({ step: 'PM', role, cardVisible: true, checks: linkChecks.length }));

  role = 'CONSULTANT';
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('role')) localStorage.removeItem(k); });
  await page.reload();
  await page.addStyleTag({ content: styles });
  await page.getByText("This week's deliverables").waitFor();
  await page.waitForTimeout(1500);
  const consultantCount = await page.getByText('PM tools', { exact: true }).count();
  if (consultantCount !== 0) errors.push(`CONSULTANT sees PM tools card (count=${consultantCount})`);
  await page.screenshot({ path: path.join(outDir, '02-consultant-no-card.png'), fullPage: true });
  console.log(JSON.stringify({ step: 'CONSULTANT', role, pmToolsCount: consultantCount }));

  role = 'LC';
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('role')) localStorage.removeItem(k); });
  await page.reload();
  await page.addStyleTag({ content: styles });
  await (await getCardTitle()).waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '03-lc-sees-card.png'), fullPage: true });
  console.log(JSON.stringify({ step: 'LC', role, cardVisible: true }));

  const video = page.video();
  await context.close();
  if (video) fs.renameSync(await video.path(), path.join(outDir, 'pm-tools-qa.webm'));
  await browser.close();
  if (errors.length) {
    console.error(errors);
    process.exit(1);
  }
  console.log('QA demo written to ' + outDir);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
