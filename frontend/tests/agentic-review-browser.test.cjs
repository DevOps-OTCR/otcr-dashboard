const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildBundle, document } = require('./navigation-browser/bundle.cjs');

// Drives the real Agentic CMS feature with the context-test API and auth stubs.
// The AI Review tab uses its in-browser mock client, so no review API is stubbed.
let browser, bundle;
before(async () => {
  bundle = await buildBundle({ outputName: 'agentic-review-browser', entry: path.join(__dirname, 'agentic-feature-browser/context-entry.tsx'), aliases: {
    './AuthContext$': path.join(__dirname, 'agentic-feature-browser/context-auth.tsx'),
    '@/lib/api$': path.join(__dirname, 'agentic-feature-browser/context-api.ts'),
    '@/lib/permissions$': path.join(__dirname, 'agentic-feature-browser/context-permissions.ts'),
    '@/components/AuthContext$': path.join(__dirname, 'agentic-feature-browser/context-auth.tsx'),
    '@/features/agentic-cms$': path.join(__dirname, '../features/agentic-cms/index.tsx'),
  }});
  browser = await chromium.launch({ headless: true, ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}) });
});
after(() => browser?.close());

const open = async (t, query = '') => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage(); await page.goto(`http://review.test/agentic-cms${query}`);
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  return page;
};
const params = (page) => new URL(page.url()).searchParams;
const submissions = (page) => page.getByRole('list', { name: 'Submissions' }).getByRole('listitem');
const reviewStatus = (page) => page.getByRole('region', { name: 'Review status' }).getByRole('status');

test('shows demo submissions in every review state, failures first with a next step', async t => {
  const page = await open(t, '?role=PM');
  await page.getByRole('tab', { name: 'AI Review' }).click();
  await page.getByRole('heading', { name: 'AI review' }).waitFor();
  await page.getByRole('note').getByText('Demo data.').waitFor();
  assert.equal(await submissions(page).count(), 4);
  for (const chip of ['All (4)', 'Not reviewed (1)', 'Awaiting review (0)', 'In progress (1)', 'Completed (1)', 'Failed (1)']) {
    assert.equal(await page.getByRole('button', { name: chip }).count(), 1, chip);
  }
  // The failed review sorts first and is selected, with its failure and next step.
  assert.equal(await submissions(page).first().getByRole('button').getAttribute('aria-current'), 'true');
  await page.getByRole('heading', { name: 'Pricing strategy — final deck' }).waitFor();
  await page.getByText('We couldn’t open this file.').waitFor();
  await page.getByText('Check that the SharePoint or OneDrive link is shared with OTCR, then retry.').waitFor();
  assert.equal(await page.getByRole('progressbar').count(), 0);
  // The selection is linkable, and unrelated query parameters are kept.
  assert.equal(params(page).get('tab'), 'review');
  assert.equal(params(page).get('submission'), 'demo-sub-final-slides');
  assert.equal(params(page).get('role'), 'PM');
});

test('filters the queue and explains that only an earlier version was reviewed', async t => {
  const page = await open(t, '?tab=review');
  await page.getByRole('button', { name: 'Not reviewed (1)' }).click();
  assert.equal(await page.getByRole('button', { name: 'Not reviewed (1)' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await submissions(page).count(), 1);
  await submissions(page).first().getByRole('button').click();
  await page.getByRole('heading', { name: 'Campus fleet partnerships — initial deck' }).waitFor();
  await page.getByText('Version 2 hasn’t had an AI review yet.').waitFor();
  await page.getByText(/Version 1 had a Basic review .* That feedback may not apply to this version; open it from the review history below\./).waitFor();
  assert.equal(params(page).get('submission'), 'demo-sub-initial-slides');
  await page.getByRole('button', { name: 'Awaiting review (0)' }).click();
  await page.getByText('No submissions match this filter.').waitFor();
});

test('opens a deep-linked submission and follows its running review to completion', async t => {
  const page = await open(t, '?tab=review&submission=demo-sub-initial-whitepaper');
  await page.getByRole('heading', { name: 'Market entry whitepaper — initial draft' }).waitFor();
  await reviewStatus(page).getByText('In progress.').waitFor();
  // CSS is stubbed in this harness, so check the bar's semantics rather than its visibility.
  const bar = page.getByRole('progressbar', { name: 'Review progress' });
  await bar.waitFor({ state: 'attached' });
  assert.equal(await bar.getAttribute('aria-valuemax'), '7');
  await page.getByText('Focus requested:').waitFor();
  // The seeded Advanced review finishes about 11 seconds after the tab opens.
  await reviewStatus(page).getByText('Completed.').waitFor({ timeout: 20_000 });
  await page.getByText(/1 Blocking · 3 Material · 1 Minor · reviewed revision rev-[0-9a-f]{7}/).waitFor();
  await page.getByText('Not read (hidden or confidential): Section “Internal pricing notes” (marked confidential)').waitFor();
  assert.equal(await page.getByRole('button', { name: 'In progress (0)' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Completed (2)' }).count(), 1);
});

test('falls back to the first submission for an unknown deep link', async t => {
  const page = await open(t, '?tab=review&submission=missing');
  await page.getByRole('heading', { name: 'Pricing strategy — final deck' }).waitFor();
  assert.equal(params(page).get('submission'), 'demo-sub-final-slides');
});

test('leaving the tab clears its URL parameters and keeps the context tabs working', async t => {
  const page = await open(t, '?role=PM&tab=review');
  await page.getByRole('heading', { name: 'AI review' }).waitFor();
  await page.getByRole('tab', { name: 'Project Context' }).click();
  await page.getByRole('textbox', { name: 'Overview' }).waitFor();
  assert.equal(params(page).get('tab'), null);
  assert.equal(params(page).get('submission'), null);
  assert.equal(params(page).get('role'), 'PM');
  assert.equal(await page.getByRole('heading', { name: 'AI review' }).count(), 0);
});

const feedback = (page) => page.getByRole('region', { name: /^Feedback \(/ });

test('shows a completed review’s summary and its comments grouped by section', async t => {
  const page = await open(t, '?tab=review&submission=demo-sub-final-whitepaper');
  const summary = page.getByRole('region', { name: 'Summary' });
  await summary.getByText(/The draft is well organised/).waitFor();
  assert.deepEqual(await summary.getByRole('list', { name: 'Comments by severity' }).getByRole('listitem').allTextContents(), [
    '0BlockingMust fix before submission',
    '2MaterialShould fix before client delivery',
    '3MinorFix if time allows',
  ]);
  await summary.getByText('Appendix B is a linked spreadsheet and was not read.').waitFor();
  assert.equal(await summary.getByRole('heading', { name: 'Top issues' }).count(), 1);

  await feedback(page).waitFor();
  assert.equal(await feedback(page).getByRole('article').count(), 5);
  assert.deepEqual(await feedback(page).getByRole('heading', { level: 5 }).allInnerTexts(),
    ['3. Market sizing', 'Executive summary', 'References', 'Whole document']);
  const card = feedback(page).getByRole('article', { name: /Figure 2 has no caption or source/ });
  await card.getByText('An unsourced figure cannot be checked by the client or by the PM.').waitFor();
  await card.getByText('Add a caption with the source and its S-ID.').waitFor();
});

test('filters feedback by severity, and a top issue clears the filter and focuses its comment', async t => {
  const page = await open(t, '?tab=review&submission=demo-sub-final-whitepaper');
  await feedback(page).waitFor();
  await page.getByRole('button', { name: 'Minor (3)' }).click();
  assert.equal(await feedback(page).getByRole('article').count(), 3);
  assert.equal(await feedback(page).getByRole('article', { name: /^Material/ }).count(), 0);
  await page.getByRole('region', { name: 'Summary' }).getByRole('button', { name: /The serviceable market is \$4\.2B/ }).click();
  assert.equal(await page.getByRole('button', { name: 'All (5)' }).getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => document.activeElement?.id?.startsWith('feedback-'));
  assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /^Material: The serviceable market is \$4\.2B in this section/);
});

test('opens feedback from an earlier version and explains that it may be out of date', async t => {
  const page = await open(t, '?tab=review&submission=demo-sub-initial-slides');
  await page.getByText('Version 2 hasn’t had an AI review yet.').waitFor();
  assert.equal(await feedback(page).count(), 0);
  await page.getByRole('button', { name: /^View feedback from Basic review of version 1/ }).click();
  await page.getByRole('note').getByText(/Viewing an earlier run: Basic review of version 1, .* The current version is 2, so this feedback may be out of date\./).waitFor();
  assert.deepEqual(await feedback(page).getByRole('heading', { level: 5 }).allInnerTexts(), [
    'Slide 3 · Market size', 'Slide 5 · Competitive landscape', 'Slide 6 · Fleet utilisation by campus',
    'Slide 8 · Partnership models', 'Slide 10 · Adoption forecast', 'Whole deck',
  ]);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('Version 2 hasn’t had an AI review yet.').waitFor();
  assert.equal(await feedback(page).count(), 0);
});

test('shows no feedback for a failed review, and resets the viewed run when the submission changes', async t => {
  const page = await open(t, '?tab=review&submission=demo-sub-initial-slides');
  await page.getByRole('button', { name: /^View feedback from Basic review of version 1/ }).click();
  await feedback(page).waitFor();
  await submissions(page).filter({ hasText: 'Pricing strategy — final deck' }).getByRole('button').click();
  await page.getByText('We couldn’t open this file.').waitFor();
  assert.equal(await feedback(page).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Summary' }).count(), 0);
  assert.equal(await page.getByText(/Viewing an earlier run/).count(), 0);
});
