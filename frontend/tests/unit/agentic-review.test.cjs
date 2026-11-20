const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Loads dependency-free TypeScript modules from the review folder, resolving
// their relative imports from the same folder.
const dir = path.join(__dirname, '../../features/agentic-cms/review');
const cache = new Map();
function load(name) {
  const file = name.replace(/^\.\//, '').replace(/\.ts$/, '') + '.ts';
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(path.join(dir, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (spec) => {
    if (!spec.startsWith('./')) throw new Error(`Review modules must stay dependency-free: ${spec}`);
    return load(spec);
  } });
  return exports;
}

const { createMockReviewClient, reviewSteps, mockRevisionId, QUEUE_MS, STEP_MS } = load('mock-review-client');
const { FAILURES } = load('copy');

const START = Date.parse('2026-11-12T15:00:00Z');
function setup(viewerName = 'Pat Morgan') {
  let t = START;
  const client = createMockReviewClient({ now: () => t, viewerName, demoProjectId: 'p1' });
  return { client, advance: (ms) => { t += ms; } };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const latestFor = async (client, submissionId) => (await client.list('p1')).reviews.find((r) => r.submissionId === submissionId);
const duration = (level, format) => QUEUE_MS + STEP_MS[level] * reviewSteps(level, format).length;

test('starts with every review state visible', async () => {
  const { client } = setup();
  const { submissions, reviews } = await client.list('p1');
  assert.equal(client.mocked, true);
  assert.equal(submissions.length, 10);
  const byId = Object.fromEntries(submissions.map((s) => [s.id, s]));
  const current = reviews.filter((r) => byId[r.submissionId].version === r.submissionVersion);
  assert.deepEqual(plain(current.map((r) => r.status).sort()), ['COMPLETED', 'FAILED', 'FAILED', 'IN_PROGRESS']);
  // The initial deck's only review is of an earlier version, so v2 is unreviewed.
  const initial = reviews.filter((r) => r.submissionId === 'demo-sub-initial-slides');
  assert.deepEqual(plain(initial.map((r) => [r.submissionVersion, r.status])), [[1, 'COMPLETED']]);
  assert.equal(byId['demo-sub-initial-slides'].version, 2);
});

test('a Basic review moves from awaiting to in progress to completed', async () => {
  const { client, advance } = setup();
  const requested = await client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'BASIC' });
  assert.equal(requested.status, 'AWAITING');
  assert.equal(requested.requestedBy, 'Pat Morgan');
  assert.equal(requested.submissionVersion, 2);

  advance(QUEUE_MS);
  let review = await latestFor(client, 'demo-sub-initial-slides');
  assert.equal(review.status, 'IN_PROGRESS');
  assert.deepEqual(plain(review.progress), { step: 1, total: 5, label: 'Opening the file' });

  advance(STEP_MS.BASIC * 2);
  review = await latestFor(client, 'demo-sub-initial-slides');
  assert.equal(review.progress.step, 3);
  assert.equal(review.progress.label, 'Checking formatting and layout');

  advance(duration('BASIC', 'slides'));
  review = await latestFor(client, 'demo-sub-initial-slides');
  assert.equal(review.status, 'COMPLETED');
  assert.equal(review.progress, undefined);
  assert.ok(review.comments.length > 0);
  assert.ok(review.comments.every((c) => c.level === 'BASIC' && c.revisionId === review.revisionId));
  assert.ok(review.comments.every((c) => c.issue && c.significance && c.fix));
  const counted = { BLOCKING: 0, MATERIAL: 0, MINOR: 0 };
  review.comments.forEach((c) => { counted[c.severity] += 1; });
  assert.deepEqual(plain(review.summary.counts), counted);
});

test('Advanced reviews take longer, use the focus note and locate document feedback by section', async () => {
  const { client, advance } = setup();
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-final-whitepaper', level: 'ADVANCED', focusNote: '  Check the risks section.  ' });
  advance(duration('BASIC', 'document'));
  let review = await latestFor(client, 'demo-sub-final-whitepaper');
  assert.equal(review.status, 'IN_PROGRESS');
  assert.equal(review.focusNote, 'Check the risks section.');
  advance(duration('ADVANCED', 'document'));
  review = await latestFor(client, 'demo-sub-final-whitepaper');
  assert.equal(review.status, 'COMPLETED');
  assert.ok(review.comments.every((c) => c.location.type !== 'slide'));
  assert.ok(review.summary.skipped.length > 0, 'advanced fixtures show a skipped confidential section');
});

test('a focus note is ignored for Basic review and limited in length for Advanced', async () => {
  const { client } = setup();
  const basic = await client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'BASIC', focusNote: 'ignored' });
  assert.equal(basic.focusNote, undefined);
  await assert.rejects(
    client.request({ projectId: 'p1', submissionId: 'demo-sub-final-whitepaper', level: 'ADVANCED', focusNote: 'x'.repeat(501) }),
    /under 500 characters/,
  );
});

test('rejects a second review while one is running, then allows it once finished', async () => {
  const { client, advance } = setup();
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'BASIC' });
  await assert.rejects(client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'ADVANCED' }), /already running/);
  advance(duration('BASIC', 'slides'));
  const advanced = await client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'ADVANCED' });
  assert.equal(advanced.level, 'ADVANCED');
  // The seeded in-progress whitepaper review blocks a new one too.
  await assert.rejects(client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-whitepaper', level: 'BASIC' }), /already running/);
});

test('rejects unknown submissions and levels', async () => {
  const { client } = setup();
  await assert.rejects(client.request({ projectId: 'p1', submissionId: 'missing', level: 'BASIC' }), /no longer available/);
  await assert.rejects(client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'EXPERT' }), /Basic or Advanced/);
});

test('each failure kind fails at its own point and only retryable kinds can be retried', async () => {
  for (const kind of Object.keys(FAILURES)) {
    const { client, advance } = setup();
    client.setNextFailure('p1', kind);
    assert.equal(client.nextFailure('p1'), kind);
    await client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'ADVANCED' });
    assert.equal(client.nextFailure('p1'), null, 'a planned failure applies to one review only');
    advance(duration('ADVANCED', 'slides'));
    const failed = await latestFor(client, 'demo-sub-initial-slides');
    assert.equal(failed.status, 'FAILED', kind);
    assert.equal(failed.failure.kind, kind);
    assert.equal(failed.comments.length, 0);
    assert.equal(failed.startedAt === undefined, kind === 'config' || kind === 'rate_limit', `${kind} start time`);

    if (FAILURES[kind].retryable) {
      const retried = await client.retry('p1', failed.id);
      assert.equal(retried.retryOf, failed.id);
      assert.equal(retried.level, 'ADVANCED');
      advance(duration('ADVANCED', 'slides'));
      assert.equal((await latestFor(client, 'demo-sub-initial-slides')).status, 'COMPLETED');
    } else {
      await assert.rejects(client.retry('p1', failed.id), new RegExp(FAILURES[kind].nextStep.slice(0, 20)));
    }
  }
});

test('a model failure happens late, after progress was shown', async () => {
  const { client, advance } = setup();
  client.setNextFailure('p1', 'model');
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'BASIC' });
  advance(QUEUE_MS + STEP_MS.BASIC * 3);
  assert.equal((await latestFor(client, 'demo-sub-initial-slides')).status, 'IN_PROGRESS');
  advance(STEP_MS.BASIC);
  assert.equal((await latestFor(client, 'demo-sub-initial-slides')).status, 'FAILED');
});

test('the seeded file-access failure can be retried, and only failed reviews can', async () => {
  const { client } = setup();
  const { reviews } = await client.list('p1');
  const failed = reviews.find((r) => r.status === 'FAILED');
  const completed = reviews.find((r) => r.status === 'COMPLETED');
  assert.equal(failed.failure.kind, 'file_access');
  await assert.rejects(client.retry('p1', completed.id), /Only a failed review/);
  await assert.rejects(client.retry('p1', 'missing'), /Only a failed review/);
  const retried = await client.retry('p1', failed.id);
  assert.equal(retried.status, 'AWAITING');
  await assert.rejects(client.retry('p1', failed.id), /already running/);
});

test('reviews are listed newest first and list() returns copies', async () => {
  const { client, advance } = setup();
  advance(1_000);
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'BASIC' });
  const first = await client.list('p1');
  assert.equal(first.reviews[0].submissionId, 'demo-sub-initial-slides');
  const dates = plain(first.reviews.map((r) => r.requestedAt));
  assert.deepEqual(dates, [...dates].sort().reverse());
  first.submissions[0].version = 99;
  assert.notEqual((await client.list('p1')).submissions[0].version, 99);
});

test('revision ids are stable per submission version', () => {
  assert.equal(mockRevisionId('a', 1), mockRevisionId('a', 1));
  assert.notEqual(mockRevisionId('a', 1), mockRevisionId('a', 2));
  assert.match(mockRevisionId('a', 1), /^rev-[0-9a-f]{7}$/);
});

test('copy: every failure kind has a title and a next step', () => {
  for (const [kind, copy] of Object.entries(FAILURES)) {
    assert.ok(copy.title && copy.nextStep, kind);
  }
});

// Queue helpers used by the AI Review tab.
const { buildQueue, filterRows, countByFilter, formatRelative, formatDuration } = load('queue');

test('queue: failed and running reviews sort first, completed last', async () => {
  const { client } = setup();
  const rows = buildQueue(await client.list('p1'));
  assert.deepEqual(plain(rows.map((r) => [r.submission.id, r.state])), [
    ['demo-sub-final-slides', 'FAILED'],
    ['demo-sub-doc-access', 'FAILED'],
    ['demo-sub-initial-whitepaper', 'IN_PROGRESS'],
    ['demo-sub-doc-native', 'NOT_REVIEWED'],
    ['demo-sub-doc-mixed', 'NOT_REVIEWED'],
    ['demo-sub-pptx-native', 'NOT_REVIEWED'],
    ['demo-sub-pptx-stale', 'NOT_REVIEWED'],
    ['demo-sub-pptx-locked', 'NOT_REVIEWED'],
    ['demo-sub-initial-slides', 'NOT_REVIEWED'],
    ['demo-sub-final-whitepaper', 'COMPLETED'],
  ]);
});

test('queue: a review of an earlier version does not count as reviewing the current one', async () => {
  const { client } = setup();
  const row = buildQueue(await client.list('p1')).find((r) => r.submission.id === 'demo-sub-initial-slides');
  assert.equal(row.current, undefined);
  assert.equal(row.earlierVersionReviewed, true);
  assert.equal(row.history.length, 1);
  assert.equal(row.history[0].submissionVersion, 1);
});

test('queue: the current review is the newest run for the current version, history is newest first', async () => {
  const { client, advance } = setup();
  const failed = (await client.list('p1')).reviews.find((r) => r.status === 'FAILED');
  advance(1_000);
  const retried = await client.retry('p1', failed.id);
  const row = buildQueue(await client.list('p1')).find((r) => r.submission.id === failed.submissionId);
  assert.equal(row.current.id, retried.id);
  assert.equal(row.state, 'AWAITING');
  assert.deepEqual(plain(row.history.map((r) => r.id)), [retried.id, failed.id]);
});

test('queue: filters and counts by state', async () => {
  const { client } = setup();
  const rows = buildQueue(await client.list('p1'));
  assert.deepEqual(plain(countByFilter(rows)), { ALL: 10, NOT_REVIEWED: 6, AWAITING: 0, IN_PROGRESS: 1, COMPLETED: 1, FAILED: 2 });
  assert.equal(filterRows(rows, 'ALL').length, 10);
  assert.deepEqual(plain(filterRows(rows, 'NOT_REVIEWED').map((r) => r.submission.id)), ['demo-sub-doc-native', 'demo-sub-doc-mixed', 'demo-sub-pptx-native', 'demo-sub-pptx-stale', 'demo-sub-pptx-locked', 'demo-sub-initial-slides']);
  assert.equal(filterRows(rows, 'AWAITING').length, 0);
});

test('queue: formats relative times and durations', () => {
  const now = START;
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(formatRelative(ago(10_000), now), 'just now');
  assert.equal(formatRelative(ago(5 * 60_000), now), '5 min ago');
  assert.equal(formatRelative(ago(3 * 3_600_000), now), '3 h ago');
  assert.equal(formatRelative(ago(26 * 3_600_000), now), 'yesterday');
  assert.equal(formatRelative(ago(3 * 86_400_000), now), '3 days ago');
  assert.equal(formatRelative(new Date(now + 5_000).toISOString(), now), 'just now');
  assert.equal(formatDuration(ago(0), ago(-45_000)), '45 s');
  assert.equal(formatDuration(ago(0), ago(-125_000)), '2 min 5 s');
  assert.equal(formatDuration(ago(0), ago(-120_000)), '2 min');
});

// Feedback helpers used by the summary card and comment list.
const { groupComments, topIssues, countBySeverity, locationLabel } = load('feedback');
const comment = (id, severity, location) => ({ id, severity, location, level: 'BASIC', issue: id, significance: 's', fix: 'f', revisionId: 'rev-1' });

test('feedback: slide comments are grouped in slide order with whole-deck comments last', () => {
  const groups = groupComments([
    comment('a', 'MINOR', { type: 'general' }),
    comment('b', 'MINOR', { type: 'slide', slide: 9, title: 'Recommendation' }),
    comment('c', 'MATERIAL', { type: 'slide', slide: 3 }),
    comment('d', 'BLOCKING', { type: 'slide', slide: 9, title: 'Recommendation' }),
  ], 'slides');
  assert.deepEqual(plain(groups.map((g) => [g.label, g.comments.map((c) => c.id)])), [
    ['Slide 3', ['c']],
    ['Slide 9 · Recommendation', ['d', 'b']],
    ['Whole deck', ['a']],
  ]);
});

test('feedback: document sections keep the order the reviewer first mentions them', () => {
  const groups = groupComments([
    comment('a', 'MINOR', { type: 'section', section: '5. Recommendations' }),
    comment('b', 'MINOR', { type: 'general' }),
    comment('c', 'MINOR', { type: 'section', section: 'Executive summary' }),
    comment('d', 'MINOR', { type: 'section', section: '5. Recommendations' }),
  ], 'document');
  assert.deepEqual(plain(groups.map((g) => [g.label, g.comments.length])), [['5. Recommendations', 2], ['Executive summary', 1], ['Whole document', 1]]);
});

test('feedback: a severity filter drops other comments and empty groups', () => {
  const comments = [comment('a', 'MINOR', { type: 'slide', slide: 1 }), comment('b', 'BLOCKING', { type: 'slide', slide: 2 })];
  assert.deepEqual(plain(groupComments(comments, 'slides', 'BLOCKING').map((g) => g.key)), ['slide:2']);
  assert.deepEqual(plain(groupComments(comments, 'slides', 'MATERIAL')), []);
  assert.deepEqual(plain(countBySeverity(comments)), { ALL: 2, BLOCKING: 1, MATERIAL: 0, MINOR: 1 });
});

test('feedback: top issues are the most severe, in reviewer order within a severity', () => {
  const comments = ['MINOR', 'MATERIAL', 'BLOCKING', 'MATERIAL', 'BLOCKING'].map((s, i) => comment(`c${i}`, s, { type: 'general' }));
  assert.deepEqual(plain(topIssues(comments).map((c) => c.id)), ['c2', 'c4', 'c1']);
  assert.deepEqual(plain(topIssues(comments, 1).map((c) => c.id)), ['c2']);
  assert.deepEqual(plain(topIssues([])), []);
});

test('feedback: location labels', () => {
  assert.equal(locationLabel({ type: 'section', section: '3. Market sizing' }, 'document'), '3. Market sizing');
  assert.equal(locationLabel({ type: 'general' }, 'document'), 'Whole document');
});

test('feedback: every fixture comment has a location the UI can label', async () => {
  const { client, advance } = setup();
  for (const id of ['demo-sub-initial-slides', 'demo-sub-final-whitepaper']) {
    await client.request({ projectId: 'p1', submissionId: id, level: 'ADVANCED' });
  }
  advance(duration('ADVANCED', 'slides'));
  const done = (await client.list('p1')).reviews.filter((r) => r.status === 'COMPLETED');
  for (const review of done) {
    const format = review.comments.some((c) => c.location.type === 'slide') ? 'slides' : 'document';
    const grouped = groupComments(review.comments, format);
    assert.equal(grouped.reduce((n, g) => n + g.comments.length, 0), review.comments.length);
    assert.ok(grouped.every((g) => g.label.length > 0));
  }
});


test('unreviewed Google Docs support all-native and mixed outcomes at both levels alongside native slide comments', async () => {
  for (const level of ['BASIC', 'ADVANCED']) {
    const { client, advance } = setup();
    const queue = await client.list('p1');
    for (const id of ['demo-sub-doc-native', 'demo-sub-doc-mixed']) {
      assert.equal(queue.reviews.some(r => r.submissionId === id), false);
      await client.request({ projectId: 'p1', submissionId: id, level });
    }
    await client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level });
    advance(duration(level, 'document'));
    const native = await latestFor(client, 'demo-sub-doc-native');
    assert.equal(native.status, 'COMPLETED');
    assert.ok(native.comments.every(c => c.placement === 'native' && c.quote && !c.fallbackReason));
    const mixed = await latestFor(client, 'demo-sub-doc-mixed');
    assert.equal(mixed.status, 'COMPLETED', 'unposted comments do not fail the review');
    const unposted = mixed.comments.filter(c => c.placement === 'fallback');
    assert.equal(unposted.length, 2);
    assert.deepEqual(plain(unposted.map(c => c.fallbackReason)), ['ambiguous', 'not-found']);
    assert.ok(unposted.every(c => c.quote && c.location.type === 'section'));
    const slides = await latestFor(client, 'demo-sub-initial-slides');
    assert.ok(slides.comments.every(c => c.placement === 'native' && c.quote === undefined));
  }
});

test('Google Docs access retry keeps the submission link and preserves the failed run', async () => {
  const { client, advance } = setup();
  const before = await client.list('p1');
  const failed = before.reviews.find(r => r.submissionId === 'demo-sub-doc-access');
  assert.equal(failed.status, 'FAILED');
  const retried = await client.retry('p1', failed.id);
  advance(duration('BASIC', 'document'));
  const done = await latestFor(client, 'demo-sub-doc-access');
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.retryOf, failed.id);
  assert.equal(done.id, retried.id);
  assert.ok(done.comments.every(c => c.placement === 'native'));
  const after = await client.list('p1');
  assert.equal(after.submissions.find(s => s.id === failed.submissionId).fileUrl,
    before.submissions.find(s => s.id === failed.submissionId).fileUrl);
  assert.equal(after.reviews.find(r => r.id === failed.id).status, 'FAILED');
});


test('PowerPoint outcomes follow the #198 writer and keep every completed finding', async () => {
  const inDeck = { comments_live: 6, partial: 4, already_posted: 6, stale: 0, locked: 0, invalid_anchor: 0, unsupported_format: 0, error: 0 };
  for (const [outcome, native] of Object.entries(inDeck)) {
    const { client, advance } = setup();
    client.setNextPowerPointResult('p1', outcome);
    await client.request({ projectId: 'p1', submissionId: 'demo-sub-pptx-native', level: 'BASIC' });
    assert.equal(client.nextPowerPointResult('p1'), null);
    advance(duration('BASIC', 'slides'));
    const review = await latestFor(client, 'demo-sub-pptx-native');
    assert.equal(review.status, 'COMPLETED', outcome);
    assert.equal(review.failure, undefined);
    assert.equal(review.powerPoint.outcome, outcome === 'partial' ? 'comments_live' : outcome);
    assert.equal(review.powerPoint.inspection, 'visual', 'coverage does not depend on how posting went');
    assert.equal(review.comments.length, 6, outcome);
    assert.equal(review.comments.filter(c => c.placement === 'native').length, native, outcome);
    assert.ok(review.comments.every(c => !c.fallbackReason), 'deck comments carry no Google Docs reasons');
    assert.ok(review.powerPoint.reviewedETag.startsWith('demo-etag-'));
  }
});

test('a posting retry never changes the findings, coverage or comment IDs', async () => {
  for (const next of ['comments_live', 'partial', 'already_posted', 'locked', 'invalid_anchor', 'unsupported_format', 'error', 'stale']) {
    const { client, advance } = setup();
    client.setNextPowerPointResult('p1', 'error');
    await client.request({ projectId: 'p1', submissionId: 'demo-sub-pptx-native', level: 'BASIC' });
    advance(duration('BASIC', 'slides'));
    const before = await latestFor(client, 'demo-sub-pptx-native');
    client.setNextPowerPointResult('p1', next);
    await client.retryPowerPointPosting('p1', before.id);
    advance(2_000);
    const after = await latestFor(client, 'demo-sub-pptx-native');
    assert.equal(after.powerPoint.outcome, next === 'partial' ? 'comments_live' : next, next);
    assert.equal(after.powerPoint.inspection, before.powerPoint.inspection);
    assert.deepEqual(plain(after.summary.counts), plain(before.summary.counts));
    assert.deepEqual(plain(after.comments.map(c => [c.id, c.issue, c.severity])), plain(before.comments.map(c => [c.id, c.issue, c.severity])), next);
  }
});

test('PowerPoint posting retry retains the same review, snapshot and findings and prevents concurrent work', async () => {
  for (const outcome of ['locked', 'error']) {
    const { client, advance } = setup();
    client.setNextPowerPointResult('p1', outcome);
    await client.request({ projectId: 'p1', submissionId: 'demo-sub-pptx-native', level: 'ADVANCED' });
    advance(duration('ADVANCED', 'slides'));
    const before = await latestFor(client, 'demo-sub-pptx-native');
    const retry = await client.retryPowerPointPosting('p1', before.id);
    assert.equal(retry.status, 'COMPLETED');
    assert.equal(retry.powerPoint.postingInProgress, true);
    await assert.rejects(client.retryPowerPointPosting('p1', before.id), /already running/);
    await assert.rejects(client.request({ projectId: 'p1', submissionId: before.submissionId, level: 'BASIC' }), /already running/);
    advance(2_000);
    const after = await latestFor(client, before.submissionId);
    assert.equal(after.id, before.id);
    assert.equal(after.finishedAt, before.finishedAt);
    assert.equal(after.powerPoint.reviewedETag, before.powerPoint.reviewedETag);
    assert.equal(after.powerPoint.postingInProgress, false);
    assert.equal(after.powerPoint.outcome, 'comments_live');
    assert.deepEqual(plain(after.comments.map(c => c.id)), plain(before.comments.map(c => c.id)));
    assert.ok(after.comments.every(c => c.placement === 'native'));
    assert.equal((await client.list('p1')).reviews.filter(r => r.submissionId === before.submissionId).length, 1);
  }
});

test('a stale deck needs a new review and a new snapshot rather than posting old findings', async () => {
  const { client, advance } = setup();
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-pptx-stale', level: 'BASIC' });
  advance(duration('BASIC', 'slides'));
  const stale = await latestFor(client, 'demo-sub-pptx-stale');
  assert.equal(stale.powerPoint.outcome, 'stale');
  await assert.rejects(client.retryPowerPointPosting('p1', stale.id), /Only a locked deck or posting error/);
  await client.request({ projectId: 'p1', submissionId: stale.submissionId, level: 'BASIC' });
  advance(duration('BASIC', 'slides'));
  const next = await latestFor(client, stale.submissionId);
  assert.equal(next.powerPoint.outcome, 'comments_live');
  assert.notEqual(next.powerPoint.reviewedETag, stale.powerPoint.reviewedETag);
  assert.equal((await client.list('p1')).reviews.find(r => r.id === stale.id).powerPoint.outcome, 'stale');
});

test('Docs do not consume the next PowerPoint result and cannot retry deck posting', async () => {
  const { client, advance } = setup();
  client.setNextPowerPointResult('p1', 'unsupported_format');
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-doc-native', level: 'BASIC' });
  assert.equal(client.nextPowerPointResult('p1'), 'unsupported_format');
  advance(duration('BASIC', 'document'));
  const doc = await latestFor(client, 'demo-sub-doc-native');
  assert.equal(doc.powerPoint, undefined);
  await assert.rejects(client.retryPowerPointPosting('p1', doc.id), /Only a locked deck or posting error/);
});


test('project queues are isolated and unconfigured projects start empty', async () => {
  const { client, advance } = setup();
  const first = await client.list('p1');
  assert.equal(first.submissions.length, 10);
  assert.deepEqual(plain(await client.list('p2')), { submissions: [], reviews: [] });
  const run = await client.request({ projectId: 'p1', submissionId: 'demo-sub-doc-native', level: 'BASIC' });
  advance(duration('BASIC', 'document'));
  assert.deepEqual(plain(await client.list('p2')), { submissions: [], reviews: [] });
  assert.equal((await client.list('p1')).reviews.find(r => r.id === run.id).status, 'COMPLETED');
  const custom = createMockReviewClient({ now: () => START, demoProjectId: 'local-project-42' });
  assert.equal((await custom.list('local-project-42')).submissions.length, 10);
  assert.deepEqual(plain(await custom.list('p1')), { submissions: [], reviews: [] });
  assert.deepEqual(plain(await createMockReviewClient().list('arbitrary-project')), { submissions: [], reviews: [] });
});

test('requests and both retry paths reject records from another project without modifying them', async () => {
  const { client, advance } = setup();
  const before = await client.list('p1');
  const failed = before.reviews.find(r => r.status === 'FAILED');
  await assert.rejects(client.request({ projectId: 'p2', submissionId: failed.submissionId, level: 'BASIC' }), /no longer available/);
  await assert.rejects(client.retry('p2', failed.id), /Only a failed review/);
  assert.deepEqual(plain(await client.list('p1')), plain(before));
  client.setNextPowerPointResult('p1', 'locked');
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-pptx-native', level: 'BASIC' });
  advance(duration('BASIC', 'slides'));
  const locked = await latestFor(client, 'demo-sub-pptx-native');
  await assert.rejects(client.retryPowerPointPosting('p2', locked.id), /Only a locked deck or posting error/);
  assert.deepEqual(plain(await latestFor(client, 'demo-sub-pptx-native')), plain(locked));
  assert.deepEqual(plain(await client.list('p2')), { submissions: [], reviews: [] });
});

test('demo controls are project-scoped and cross-project failures do not consume them', async () => {
  const { client } = setup();
  client.setNextFailure('p2', 'model');
  client.setNextPowerPointResult('p2', 'stale');
  assert.equal(client.nextFailure('p1'), null);
  assert.equal(client.nextPowerPointResult('p1'), null);
  await assert.rejects(client.request({ projectId: 'p2', submissionId: 'demo-sub-pptx-native', level: 'BASIC' }));
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-pptx-native', level: 'BASIC' });
  assert.equal(client.nextFailure('p2'), 'model');
  assert.equal(client.nextPowerPointResult('p2'), 'stale');
  assert.equal(client.nextFailure('p1'), null);
  assert.equal(client.nextPowerPointResult('p1'), null);
});

// Google Docs posting outcomes from comment_google_doc (#198), simulated per batch.
const docsRun = async (result, submissionId = 'demo-sub-doc-native') => {
  const { client, advance } = setup();
  client.setNextDocsResult('p1', result);
  await client.request({ projectId: 'p1', submissionId, level: 'BASIC' });
  assert.equal(client.nextDocsResult('p1'), null, 'a planned Docs result is used once');
  advance(duration('BASIC', 'document'));
  const review = await latestFor(client, submissionId);
  assert.equal(review.status, 'COMPLETED');
  return review.comments.map(c => c.placement === 'native' ? (c.anchorVerified === false ? 'misplaced' : 'native') : c.fallbackReason);
};

test('Docs batches end the way #198 ends them', async () => {
  assert.deepEqual(plain(await docsRun('all_native')), ['native', 'native', 'native', 'native', 'native']);
  assert.deepEqual(plain(await docsRun('mixed')), ['native', 'ambiguous', 'native', 'native', 'not-found']);
  assert.deepEqual(plain(await docsRun('misplaced')), ['native', 'misplaced', 'native', 'native', 'native']);
  // An unconfirmed save stops the batch; later comments were never attempted.
  assert.deepEqual(plain(await docsRun('uncertain')), ['native', 'native', 'comment-uncertain', 'comment-failed', 'comment-failed']);
  // A changed document or missing access stops every remaining comment with the same reason.
  assert.deepEqual(plain(await docsRun('document_changed')), ['native', 'native', 'document-changed', 'document-changed', 'document-changed']);
  assert.deepEqual(plain(await docsRun('no_access')), Array(5).fill('no-comment-access'));
});

test('a misplaced Docs comment reports the text Google attached it to', async () => {
  const { client, advance } = setup();
  client.setNextDocsResult('p1', 'misplaced');
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-doc-native', level: 'BASIC' });
  advance(duration('BASIC', 'document'));
  const [, misplaced, third] = (await latestFor(client, 'demo-sub-doc-native')).comments;
  assert.equal(misplaced.anchorVerified, false);
  assert.equal(misplaced.anchoredText, third.quote);
  assert.notEqual(misplaced.anchoredText, misplaced.quote);
  assert.equal(third.anchorVerified, true);
  assert.equal(third.anchoredText, third.quote);
});

test('the Docs demo result applies only to documents, and sample defaults are unchanged', async () => {
  const { client, advance } = setup();
  client.setNextDocsResult('p1', 'no_access');
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-pptx-native', level: 'BASIC' });
  assert.equal(client.nextDocsResult('p1'), 'no_access', 'a deck does not consume the Docs result');
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-doc-mixed', level: 'BASIC' });
  await client.request({ projectId: 'p1', submissionId: 'demo-sub-doc-native', level: 'BASIC' });
  advance(duration('BASIC', 'document'));
  assert.ok((await latestFor(client, 'demo-sub-doc-mixed')).comments.every(c => c.fallbackReason === 'no-comment-access'));
  assert.ok((await latestFor(client, 'demo-sub-doc-native')).comments.every(c => c.placement === 'native'), 'later requests use the default');
  assert.equal(client.nextDocsResult('p2'), null, 'demo results are per project');
});

const { POWERPOINT_RESULTS, powerPointResultCopy, DOC_FALLBACKS, docFallbackCopy, GOOGLE_DOCS_RESULTS } = load('copy');

test('copy: every #198 outcome and reason has guidance, and unknown values fail safe', () => {
  assert.deepEqual(plain(Object.keys(POWERPOINT_RESULTS).sort()),
    ['already_posted', 'comments_live', 'error', 'invalid_anchor', 'locked', 'partial', 'stale', 'unsupported_format']);
  assert.deepEqual(plain(Object.keys(DOC_FALLBACKS).sort()),
    ['ambiguous', 'comment-failed', 'comment-uncertain', 'document-changed', 'no-comment-access', 'not-found']);
  assert.equal(Object.keys(GOOGLE_DOCS_RESULTS).length, 6);
  // An unconfirmed upload may have succeeded: check the deck before any retry.
  assert.equal(POWERPOINT_RESULTS.error.inDeck, 'unknown');
  assert.equal(POWERPOINT_RESULTS.error.retry, 'check_first');
  assert.match(POWERPOINT_RESULTS.error.nextStep, /look for the comments first/);
  for (const outcome of ['already_posted', 'invalid_anchor', 'unsupported_format']) {
    assert.equal(POWERPOINT_RESULTS[outcome].retry, 'none', outcome);
  }
  assert.notEqual(POWERPOINT_RESULTS.already_posted.nextStep, POWERPOINT_RESULTS.invalid_anchor.nextStep);
  // Retired or future outcomes never leave the summary without copy.
  for (const outcome of ['legacy_format', 'direct_download', 'something_new', 'toString']) {
    const copy = powerPointResultCopy(outcome);
    assert.ok(copy.title && copy.nextStep, outcome);
    assert.equal(copy.retry, 'none');
    assert.equal(copy.inDeck, 'unknown');
  }
  assert.equal(docFallbackCopy('comment-uncertain').kind, 'uncertain');
  assert.match(docFallbackCopy('comment-uncertain').nextStep, /Check the document before adding it again/);
  assert.match(docFallbackCopy('no-comment-access').nextStep, /Commenter/);
  for (const reason of ['something-new', undefined, 'constructor']) {
    assert.equal(docFallbackCopy(reason).kind, 'uncertain', String(reason));
  }
});
