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

const open = async (t, query = '', clock = false) => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', body: route.request().url().endsWith('/bundle.js') ? bundle : document }));
  const page = await context.newPage();
  if (clock) await page.clock.install({ time: new Date('2026-11-14T18:00:00Z') });
  await page.goto(`http://review.test/agentic-cms${query}`);
  await page.getByRole('tab', { name: 'Project Context' }).waitFor();
  return page;
};
const params = (page) => new URL(page.url()).searchParams;
const submissions = (page) => page.getByRole('list', { name: 'Submissions' }).getByRole('listitem');
const statusRegion = (page) => page.getByRole('region', { name: 'Review status' });
const reviewStatus = (page) => statusRegion(page).getByRole('status');

test('shows demo submissions in every review state, failures first with a next step', async t => {
  const page = await open(t, '?role=PM');
  await page.getByRole('tab', { name: 'AI Review' }).click();
  await page.getByRole('heading', { name: 'AI review' }).waitFor();
  await page.getByRole('note').getByText('Demo data.').waitFor();
  assert.equal(await submissions(page).count(), 10);
  for (const chip of ['All (10)', 'Not reviewed (6)', 'Awaiting review (0)', 'In progress (1)', 'Completed (1)', 'Failed (2)']) {
    assert.equal(await page.getByRole('button', { name: chip }).count(), 1, chip);
  }
  // The failed review sorts first and is selected, with its failure and next step.
  assert.equal(await submissions(page).first().getByRole('button').getAttribute('aria-current'), 'true');
  await page.getByRole('heading', { name: 'Pricing strategy — final deck' }).waitFor();
  await statusRegion(page).getByText('We couldn’t open this file.').waitFor();
  await statusRegion(page).getByText('Check that the SharePoint or OneDrive link is shared with OTCR, then retry.').waitFor();
  assert.equal(await page.getByRole('progressbar').count(), 0);
  // The selection is linkable, and unrelated query parameters are kept.
  assert.equal(params(page).get('tab'), 'review');
  assert.equal(params(page).get('submission'), 'demo-sub-final-slides');
  assert.equal(params(page).get('role'), 'PM');
});

test('filters the queue and explains that only an earlier version was reviewed', async t => {
  const page = await open(t, '?tab=review');
  await page.getByRole('button', { name: 'Not reviewed (6)' }).click();
  assert.equal(await page.getByRole('button', { name: 'Not reviewed (6)' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await submissions(page).count(), 6);
  await submissions(page).filter({ hasText: 'Campus fleet partnerships' }).getByRole('button').click();
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

test('completed Docs show a brief summary and only unposted comments in a collapsed section', async t => {
  const page = await open(t, '?tab=review&submission=demo-sub-final-whitepaper');
  const summary = page.getByRole('region', { name: 'Summary' });
  await summary.getByText(/The draft is well organised/).waitFor();
  await summary.getByText('Demo result: 3 comments added to Google Docs. 2 couldn’t be added; view them below.').waitFor();
  assert.equal(await summary.getByRole('button', { name: 'Open in Google Docs' }).isDisabled(), true);
  await summary.getByText('Demo only: no real document is linked and no comments were posted.').waitFor();
  assert.equal(await summary.getByRole('heading', { name: 'Top issues' }).count(), 0);
  assert.equal(await summary.getByRole('list', { name: 'Comments by severity' }).count(), 0);
  assert.equal(await feedback(page).isVisible(), false);
  await page.getByText('Comments not added to Google Docs (2)', { exact: true }).click();
  await feedback(page).waitFor();
  assert.equal(await feedback(page).getByRole('article').count(), 2);
  assert.deepEqual(await feedback(page).getByRole('heading', { level: 5 }).allInnerTexts(), ['3. Market sizing', 'References']);
  await feedback(page).getByText('“Campus demand increased during the pilot.”').waitFor();
  await feedback(page).getByText(/this passage appears more than once/).waitFor();
  await feedback(page).getByText(/the quoted passage could not be found/).waitFor();
  await feedback(page).getByText('An unsourced figure cannot be checked by the client or by the PM.').waitFor();
  await feedback(page).getByText('Add a caption with the source and its S-ID.').waitFor();
  assert.equal(await feedback(page).getByText('Use one figure in both places and cite its source once.').count(), 0, 'posted comments stay in Docs');
  await page.getByRole('button', { name: 'Minor (1)' }).click();
  assert.equal(await feedback(page).getByRole('article').count(), 1);
  await page.getByText('Comments not added to Google Docs (2)', { exact: true }).click();
  assert.equal(await feedback(page).isVisible(), false);
});

test('slide feedback keeps its severity filters and top-issue keyboard focus', async t => {
  const page = await open(t, '?tab=review&submission=demo-sub-initial-slides');
  await page.getByRole('button', { name: /^View feedback from Basic review of version 1/ }).click();
  await feedback(page).waitFor();
  await page.getByRole('button', { name: 'Minor (4)' }).click();
  assert.equal(await feedback(page).getByRole('article').count(), 4);
  assert.equal(await feedback(page).getByRole('article', { name: /^Material/ }).count(), 0);
  await page.getByRole('region', { name: 'Summary' }).getByRole('button', { name: /The serviceable market is \$4\.2B/ }).click();
  assert.equal(await page.getByRole('button', { name: 'All (6)' }).getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => document.activeElement?.id?.startsWith('feedback-'));
  assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /^Material: The serviceable market/);
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

// Requesting reviews (PM role: the context stub grants edit access to Project One).
const requestForm = (page) => page.getByRole('form', { name: 'Request AI review' });

test('a PM requests a Basic review, follows it to its feedback and is offered Advanced next', async t => {
  const page = await open(t, '?role=PM&tab=review&submission=demo-sub-initial-slides');
  await page.getByRole('button', { name: 'Request AI review' }).click();
  assert.equal(await requestForm(page).getByRole('radio', { name: /^Basic: Formatting and consistency/ }).isChecked(), true);
  assert.equal(await requestForm(page).getByRole('textbox').count(), 0, 'a focus note is only offered for Advanced');
  await requestForm(page).getByRole('button', { name: 'Start Basic review' }).click();
  await reviewStatus(page).getByText('Awaiting review.').waitFor();
  assert.equal(await requestForm(page).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Request AI review' }).count(), 0, 'no second request while one is running');
  await page.getByRole('button', { name: 'Awaiting review (1)' }).waitFor();
  await page.getByText('Requested by You').waitFor();
  await reviewStatus(page).getByText('In progress.').waitFor({ timeout: 5_000 });
  await reviewStatus(page).getByText('Completed.').waitFor({ timeout: 15_000 });
  await page.getByRole('region', { name: 'Summary' }).getByText('6 comments added to PowerPoint.').waitFor();
  assert.equal(await feedback(page).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Review history' }).getByRole('listitem').count(), 2);

  await page.getByRole('button', { name: 'Run Advanced review' }).click();
  assert.equal(await requestForm(page).getByRole('radio', { name: /^Advanced: Content, evidence and alignment/ }).isChecked(), true);
  await requestForm(page).getByRole('textbox', { name: /What should the reviewer focus on\?/ }).waitFor();
  await requestForm(page).getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await requestForm(page).count(), 0);
});

const clearProjectContext = async (page) => {
  await page.getByRole('textbox', { name: 'Overview' }).fill('');
  await page.getByRole('textbox', { name: 'SOW / Scope' }).fill('');
  await page.getByRole('button', { name: 'Save context' }).click();
  await page.getByText('Context saved.').waitFor();
};

test('an Advanced request keeps its focus note and warns when the project has no overview or SOW', async t => {
  const page = await open(t, '?role=PM');
  await clearProjectContext(page);
  await page.getByRole('tab', { name: 'AI Review' }).click();
  await submissions(page).filter({ hasText: 'Campus fleet partnerships' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Request AI review' }).click();
  assert.equal(await page.getByText('This project has no saved overview or SOW.').count(), 0, 'Basic does not need project context');
  await requestForm(page).getByRole('radio', { name: /^Advanced/ }).check();
  await requestForm(page).getByText(/This project has no saved overview or SOW\./).waitFor();
  await requestForm(page).getByRole('textbox', { name: /What should the reviewer focus on\?/ }).fill('Check slide 9 against the SOW.');
  await requestForm(page).getByText('30/500').waitFor();
  await requestForm(page).getByRole('button', { name: 'Start Advanced review' }).click();
  await reviewStatus(page).getByText('Awaiting review.').waitFor();
  await page.getByText('Check slide 9 against the SOW.').waitFor();
  await statusRegion(page).getByText('Advanced review', { exact: true }).waitFor();
});

test('the project-context link opens that tab, and demo reviews survive switching tabs', async t => {
  const page = await open(t, '?role=PM');
  await clearProjectContext(page);
  await page.getByRole('tab', { name: 'AI Review' }).click();
  await submissions(page).filter({ hasText: 'Campus fleet partnerships' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Request AI review' }).click();
  await requestForm(page).getByRole('button', { name: 'Start Basic review' }).click();
  await reviewStatus(page).getByText('Awaiting review.').waitFor();

  await submissions(page).filter({ hasText: 'Pricing strategy — final whitepaper' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Request another review' }).click();
  await requestForm(page).getByRole('radio', { name: /^Advanced/ }).check();
  await requestForm(page).getByRole('button', { name: 'Add them in Project Context' }).click();
  await page.getByRole('textbox', { name: 'Overview' }).waitFor();

  await page.getByRole('tab', { name: 'AI Review' }).click();
  await submissions(page).filter({ hasText: 'Campus fleet partnerships' }).getByText(/^Basic · (Awaiting review|In progress|Completed)$/).waitFor();
});

test('a planned demo failure shows its next step, and Retry starts a new run', async t => {
  const page = await open(t, '?role=PM&tab=review&submission=demo-sub-initial-slides');
  await page.getByText('Demo controls').click();
  const control = page.getByRole('combobox', { name: /Result of the next review/ });
  await control.selectOption('rate_limit');
  await page.getByRole('button', { name: 'Request AI review' }).click();
  await requestForm(page).getByRole('button', { name: 'Start Basic review' }).click();
  await reviewStatus(page).getByText('Awaiting review.').waitFor();
  assert.equal(await control.inputValue(), '', 'a planned failure is used once');
  await statusRegion(page).getByText('The reviewer is busy right now.').waitFor({ timeout: 5_000 });
  await statusRegion(page).getByText('Retry in a few minutes. Nothing was lost.').waitFor();
  await page.getByRole('button', { name: 'Retry Basic review' }).click();
  await reviewStatus(page).getByText('Awaiting review.').waitFor();
  const history = page.getByRole('region', { name: 'Review history' });
  await history.getByText(/^Basic · v2 · retry/).waitFor();
  assert.equal(await history.getByRole('listitem').count(), 3);
});

test('a failure that retrying cannot fix offers no Retry', async t => {
  const page = await open(t, '?role=PM&tab=review&submission=demo-sub-initial-slides');
  await page.getByText('Demo controls').click();
  await page.getByRole('combobox', { name: /Result of the next review/ }).selectOption('unsupported_file');
  await page.getByRole('button', { name: 'Request AI review' }).click();
  await requestForm(page).getByRole('button', { name: 'Start Basic review' }).click();
  await statusRegion(page).getByText('Only PowerPoint and Word files can be reviewed.').waitFor({ timeout: 8_000 });
  await statusRegion(page).getByText('Ask the consultant to resubmit a PowerPoint or Word link, then request a new review.').waitFor();
  assert.equal(await page.getByRole('button', { name: /^Retry/ }).count(), 0);
  // The seeded file-access failure on another deck can be retried.
  await submissions(page).filter({ hasText: 'Pricing strategy — final deck' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Retry Advanced review' }).waitFor();
});

test('a consultant sees review status and feedback but cannot request reviews or use demo controls', async t => {
  const page = await open(t, '?tab=review&submission=demo-sub-initial-slides');
  await page.getByText('Only this project’s PM, LCs and admins can request AI reviews.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Request AI review' }).count(), 0);
  assert.equal(await page.getByText('Demo controls').count(), 0);
  await submissions(page).filter({ hasText: 'Pricing strategy — final deck' }).getByRole('button').click();
  await page.getByText('We couldn’t open this file.').waitFor();
  assert.equal(await page.getByRole('button', { name: /^Retry/ }).count(), 0);
  await submissions(page).filter({ hasText: 'Pricing strategy — final whitepaper' }).getByRole('button').click();
  await page.getByText('Comments not added to Google Docs (2)', { exact: true }).click();
  await feedback(page).waitFor();
  assert.equal(await page.getByRole('button', { name: /Run Advanced review|Request another review/ }).count(), 0);
});


for (const [id, level, mixed] of [
  ['demo-sub-doc-native', 'BASIC', false],
  ['demo-sub-doc-mixed', 'ADVANCED', true],
]) {
  test(`a PM requests ${level} on an unreviewed Google Doc and sees its ${mixed ? 'mixed' : 'all-posted'} outcome`, async t => {
    const page = await open(t, `?role=PM&tab=review&submission=${id}`);
    await page.getByText('Version 1 hasn’t had an AI review yet.').waitFor();
    await page.getByRole('button', { name: 'Request AI review' }).click();
    if (level === 'ADVANCED') {
      await requestForm(page).getByRole('radio', { name: /^Advanced/ }).check();
      await requestForm(page).getByRole('textbox').fill('Check alignment with the client scope.');
    }
    await requestForm(page).getByRole('button', { name: `Start ${level === 'BASIC' ? 'Basic' : 'Advanced'} review` }).click();
    await reviewStatus(page).getByText('Awaiting review.').waitFor();
    await reviewStatus(page).getByText('In progress.').waitFor({ timeout: 5_000 });
    await reviewStatus(page).getByText('Completed.').waitFor({ timeout: 20_000 });
    const summary = page.getByRole('region', { name: 'Summary' });
    await summary.getByText(mixed ? 'Demo result: 3 comments added to Google Docs. 2 couldn’t be added; view them below.' : 'Demo result: 5 comments added to Google Docs.').waitFor();
    assert.equal(await summary.getByRole('button', { name: 'Open in Google Docs' }).isDisabled(), true);
    assert.equal(await page.getByText('Comments not added to Google Docs (2)', { exact: true }).count(), mixed ? 1 : 0);
    if (mixed) {
      await page.getByText('Comments not added to Google Docs (2)', { exact: true }).click();
      assert.equal(await feedback(page).getByRole('article').count(), 2);
      await page.getByRole('button', { name: 'Request another review' }).click();
      await requestForm(page).getByRole('button', { name: 'Start Advanced review' }).click();
      assert.equal(await feedback(page).count(), 0, 'old fallback comments disappear while the next review runs');
    }
  });
}

test('Google Docs sharing failure explains access and retries the same submission without resubmission', async t => {
  const page = await open(t, '?role=PM&tab=review&submission=demo-sub-doc-access', true);
  await statusRegion(page).getByText('We couldn’t open this Google Doc.').waitFor();
  await statusRegion(page).getByText('Ask the owner to share this Google Doc with the review bot as Commenter, then retry using the same submission link.').waitFor();
  await page.getByText('Demo: Retry simulates corrected sharing. No permissions are checked or changed.').waitFor();
  assert.equal(await page.getByRole('region', { name: 'Summary' }).count(), 0);
  await page.getByRole('button', { name: 'Retry Basic review' }).click();
  await reviewStatus(page).getByText('Awaiting review.').waitFor();
  await page.clock.fastForward(9_000);
  await reviewStatus(page).getByText('Completed.').waitFor({ timeout: 15_000 });
  await page.getByText('Demo result: 5 comments added to Google Docs.').waitFor();
  assert.equal(params(page).get('submission'), 'demo-sub-doc-access');
  assert.equal(await page.getByRole('region', { name: 'Review history' }).getByRole('listitem').count(), 2);
});


const requestDeck = async (page) => {
  await page.getByRole('button', { name: 'Request AI review' }).click();
  await requestForm(page).getByRole('button', { name: 'Start Basic review' }).click();
  await reviewStatus(page).getByText('Awaiting review.').waitFor();
  await page.clock.fastForward(9_000);
  await reviewStatus(page).getByText('Completed.').waitFor();
};

for (const [outcome, title, count] of [
  ['comments_live', 'Comments added to PowerPoint.', 0],
  ['partial', 'Some comments couldn’t be added.', 2],
  ['stale', 'The deck changed during review.', 6],
  ['locked', 'The deck is locked for editing.', 6],
  ['legacy_format', 'This deck uses an older comment format.', 6],
  ['direct_download', 'This link doesn’t support writing comments back.', 4],
  ['error', 'Comments couldn’t be uploaded.', 6],
  ['no_comments_written', 'No comments were added.', 6],
]) {
  test(`PowerPoint ${outcome} shows the correct action and keeps unposted findings`, async t => {
    const page = await open(t, '?role=PM&tab=review&submission=demo-sub-pptx-native', true);
    await page.getByText('Demo controls', { exact: true }).click();
    const control = page.getByRole('combobox', { name: /Posting result of the next PowerPoint/ });
    await control.selectOption(outcome);
    await requestDeck(page);
    assert.equal(await control.inputValue(), '');
    const summary = page.getByRole('region', { name: 'Summary' });
    await summary.getByText(`Demo result: ${title}`, { exact: true }).waitFor();
    assert.equal(await summary.getByRole('button', { name: 'Open in PowerPoint' }).isDisabled(), true);
    await summary.getByText('Demo only: no real deck is linked, changed or uploaded. Comments and posting retries are simulated.').waitFor();
    await summary.getByText(outcome === 'direct_download' ? /Simulated coverage: text only/ : 'Simulated coverage: slide text and visual layout.').waitFor();
    assert.equal(await summary.getByRole('button', { name: 'Retry posting comments', exact: true }).count(), ['locked', 'error'].includes(outcome) ? 1 : 0);
    if (count) {
      assert.equal(await feedback(page).isVisible(), false);
      await summary.getByText(`Comments not added to PowerPoint (${count})`, { exact: true }).click();
      assert.equal(await feedback(page).getByRole('article').count(), count);
      assert.equal(await feedback(page).getByText(/quoted passage/).count(), 0, 'deck failures must not show Docs anchoring errors');
      if (outcome === 'stale') {
        await summary.getByText('Feedback from an earlier deck snapshot; it may not match the latest version.').waitFor();
        await page.getByRole('button', { name: 'Review latest version' }).click();
        await requestForm(page).getByRole('button', { name: 'Start Basic review' }).click();
        await page.clock.fastForward(9_000);
        await page.getByRole('region', { name: 'Summary' }).getByText('6 comments added to PowerPoint.').waitFor();
        assert.equal(await page.getByRole('region', { name: 'Review history' }).getByRole('listitem').count(), 2);
      } else if (['locked', 'error'].includes(outcome)) {
        await summary.getByRole('button', { name: 'Retry posting comments', exact: true }).click();
        await summary.getByRole('button', { name: 'Posting comments…' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Request another review' }).count(), 0);
        await page.clock.fastForward(2_100);
        await summary.getByText('6 comments added to PowerPoint.').waitFor();
        assert.equal(await feedback(page).count(), 0);
        assert.equal(await page.getByRole('region', { name: 'Review history' }).count(), 0, 'retrying posting keeps one review');
      }
    } else {
      assert.equal(await feedback(page).count(), 0);
      assert.equal(await summary.getByText(/Comments not added to PowerPoint/).count(), 0);
    }
  });
}

test('project switching clears old review data and restores the original project’s posting retry state', async t => {
  const page = await open(t, '?role=PM&tab=review&submission=demo-sub-pptx-locked&delayProjectTwo', true);
  await requestDeck(page);
  await page.getByRole('button', { name: 'Retry posting comments', exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('p2');
  await page.getByText('No submissions yet. They appear here when consultants submit slides or whitepapers.').waitFor();
  assert.equal(await submissions(page).count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Partnership options — PowerPoint draft' }).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Summary' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Retry posting comments', exact: true }).count(), 0);
  await page.clock.fastForward(200);
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('p1');
  await submissions(page).filter({ hasText: 'Partnership options' }).getByRole('button').click();
  await page.getByRole('region', { name: 'Summary' }).getByText('Demo result: The deck is locked for editing.').waitFor();
  await page.getByRole('button', { name: 'Retry posting comments', exact: true }).click();
  await page.clock.fastForward(2_100);
  await page.getByRole('region', { name: 'Summary' }).getByText('6 comments added to PowerPoint.').waitFor();
});

test('an active review remains in its original project across empty-project and tab switches', async t => {
  const page = await open(t, '?role=PM&tab=review&submission=demo-sub-doc-native', true);
  await page.getByRole('button', { name: 'Request AI review' }).click();
  await requestForm(page).getByRole('button', { name: 'Start Basic review' }).click();
  await reviewStatus(page).getByText('Awaiting review.').waitFor();
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('p2');
  await page.getByText('No submissions yet. They appear here when consultants submit slides or whitepapers.').waitFor();
  await page.clock.fastForward(9_000);
  assert.equal(await submissions(page).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Summary' }).count(), 0);
  await page.getByRole('tab', { name: 'Project Context' }).click();
  await page.getByRole('tab', { name: 'AI Review' }).click();
  await page.getByText('No submissions yet. They appear here when consultants submit slides or whitepapers.').waitFor();
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('p1');
  await submissions(page).filter({ hasText: 'Market sizing whitepaper' }).getByRole('button').click();
  await reviewStatus(page).getByText('Completed.').waitFor();
  await page.getByText('Demo result: 5 comments added to Google Docs.').waitFor();
  assert.equal(await page.getByRole('region', { name: 'Review history' }).count(), 0, 'the original request was retained, not recreated');
});

test('planned demo failures do not carry across projects', async t => {
  const page = await open(t, '?role=ADMIN&tab=review', true);
  await page.getByText('Demo controls', { exact: true }).click();
  await page.getByRole('combobox', { name: /Result of the next review you start/ }).selectOption('rate_limit');
  await page.getByRole('combobox', { name: /Posting result of the next PowerPoint/ }).selectOption('locked');
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('p2');
  await page.getByText('No submissions yet. They appear here when consultants submit slides or whitepapers.').waitFor();
  await page.getByText('Demo controls', { exact: true }).click();
  assert.equal(await page.getByRole('combobox', { name: /Result of the next review you start/ }).inputValue(), '');
  assert.equal(await page.getByRole('combobox', { name: /Posting result of the next PowerPoint/ }).inputValue(), '');
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('p1');
  await page.getByText('Demo controls', { exact: true }).click();
  assert.equal(await page.getByRole('combobox', { name: /Result of the next review you start/ }).inputValue(), 'rate_limit');
  assert.equal(await page.getByRole('combobox', { name: /Posting result of the next PowerPoint/ }).inputValue(), 'locked');
});
