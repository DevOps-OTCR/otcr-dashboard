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
  const client = createMockReviewClient({ now: () => t, viewerName });
  return { client, advance: (ms) => { t += ms; } };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const latestFor = async (client, submissionId) => (await client.list('p1')).reviews.find((r) => r.submissionId === submissionId);
const duration = (level, format) => QUEUE_MS + STEP_MS[level] * reviewSteps(level, format).length;

test('starts with every review state visible', async () => {
  const { client } = setup();
  const { submissions, reviews } = await client.list('p1');
  assert.equal(client.mocked, true);
  assert.equal(submissions.length, 4);
  const byId = Object.fromEntries(submissions.map((s) => [s.id, s]));
  const current = reviews.filter((r) => byId[r.submissionId].version === r.submissionVersion);
  assert.deepEqual(plain(current.map((r) => r.status).sort()), ['COMPLETED', 'FAILED', 'IN_PROGRESS']);
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
    client.setNextFailure(kind);
    assert.equal(client.nextFailure(), kind);
    await client.request({ projectId: 'p1', submissionId: 'demo-sub-initial-slides', level: 'ADVANCED' });
    assert.equal(client.nextFailure(), null, 'a planned failure applies to one review only');
    advance(duration('ADVANCED', 'slides'));
    const failed = await latestFor(client, 'demo-sub-initial-slides');
    assert.equal(failed.status, 'FAILED', kind);
    assert.equal(failed.failure.kind, kind);
    assert.equal(failed.comments.length, 0);
    assert.equal(failed.startedAt === undefined, kind === 'config' || kind === 'rate_limit', `${kind} start time`);

    if (FAILURES[kind].retryable) {
      const retried = await client.retry(failed.id);
      assert.equal(retried.retryOf, failed.id);
      assert.equal(retried.level, 'ADVANCED');
      advance(duration('ADVANCED', 'slides'));
      assert.equal((await latestFor(client, 'demo-sub-initial-slides')).status, 'COMPLETED');
    } else {
      await assert.rejects(client.retry(failed.id), new RegExp(FAILURES[kind].nextStep.slice(0, 20)));
    }
  }
});

test('a model failure happens late, after progress was shown', async () => {
  const { client, advance } = setup();
  client.setNextFailure('model');
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
  await assert.rejects(client.retry(completed.id), /Only a failed review/);
  await assert.rejects(client.retry('missing'), /Only a failed review/);
  const retried = await client.retry(failed.id);
  assert.equal(retried.status, 'AWAITING');
  await assert.rejects(client.retry(failed.id), /already running/);
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
