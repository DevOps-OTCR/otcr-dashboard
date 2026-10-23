const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function moduleAt(file, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../../lib/${file}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText, { exports, setTimeout, clearTimeout, queueMicrotask, ...globals });
  return exports;
}
const validation = moduleAt('autosave-validation');
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  let now = 0, id = 0;
  const timers = new Map();
  const { AutosaveStore } = moduleAt('autosave', {
    setTimeout: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const store = new AutosaveStore(), writes = [];
  const options = { id: 'notes', resource: 'week', label: 'Notes', href: '/workstream', value: 'original', save: async value => { writes.push(value); } };
  store.connect(options);
  return { store, writes, options, tick: async ms => {
    now += ms;
    for (const [id, t] of timers) if (t.at <= now) { timers.delete(id); t.fn(); }
    await drain();
  } };
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('hydration, repeated props, unchanged values and background refresh never write', async () => {
  const { store, options, writes, tick } = fixture();
  store.sync(options); store.edit('notes', 'original'); await tick(1000);
  store.sync({ ...options, value: 'remote' }); await tick(1000);
  assert.deepEqual(writes, []); assert.equal(store.get('notes').value, 'remote');
  assert.equal(store.pending().length, 0);
});
test('typing coalesces at 650ms, blur flushes early, and empty text persists', async () => {
  const { store, writes, tick } = fixture();
  store.edit('notes', 'first'); await tick(500); store.edit('notes', 'latest');
  await tick(649); assert.deepEqual(writes, []); await tick(1); assert.deepEqual(writes, ['latest']);
  store.edit('notes', ''); assert.equal(await store.flush('notes'), true);
  assert.deepEqual(writes, ['latest', '']); assert.equal(store.get('notes').status, 'saved');
});
test('in-flight edits never get marked Saved by an old response; latest value follows serially', async () => {
  const { store, options, writes, tick } = fixture(), first = deferred(), second = deferred();
  store.sync({ ...options, save: async value => { writes.push(value); await (value === 'first' ? first : second).promise; } });
  store.edit('notes', 'first'); await tick(650);
  store.edit('notes', 'latest'); await tick(650); assert.deepEqual(writes, ['first']);
  first.resolve(); await drain(); assert.deepEqual(writes, ['first', 'latest']);
  assert.notEqual(store.get('notes').status, 'saved'); assert.equal(store.get('notes').value, 'latest');
  second.resolve(); await drain(); assert.equal(store.get('notes').status, 'saved');
});
test('reverting to the original value while a write is in flight still restores it on the server', async () => {
  const { store, options, writes, tick } = fixture(), first = deferred();
  store.sync({ ...options, save: async value => { writes.push(value); if (value === 'first') await first.promise; } });
  store.edit('notes', 'first'); await tick(650); store.edit('notes', 'original');
  const flushed = store.flushAll(); first.resolve(); assert.equal(await flushed, true);
  assert.deepEqual(writes, ['first', 'original']);
});
test('failures retain local edits, do not retry endlessly, and Retry writes the latest value', async () => {
  const { store, options, writes, tick } = fixture(); let fail = true;
  store.sync({ ...options, save: async value => { writes.push(value); if (fail) throw Error('offline'); } });
  store.edit('notes', 'edited'); await tick(650); await tick(60000);
  assert.equal(writes.length, 1); assert.equal(store.get('notes').status, 'error');
  assert.equal(store.get('notes').value, 'edited'); assert.equal(store.pending().length, 1);
  fail = false; assert.equal(await store.flushAll(), true); assert.equal(writes.length, 2);
});
test('a server refresh cannot erase a dirty field, including after a failed request', async () => {
  const { store, options, tick } = fixture();
  store.sync({ ...options, save: async () => { throw Error('offline'); } });
  store.edit('notes', 'mine'); await tick(650); store.sync({ ...options, value: 'server update' });
  assert.equal(store.get('notes').value, 'mine'); assert.equal(store.get('notes').status, 'error');
});
test('date and deadline writes sharing a sprint serialize; a different card stays usable', async () => {
  const { store, tick } = fixture(), first = deferred(), order = [];
  store.connect({ id: 'week-date', resource: 'week', label: '', href: '', value: 'old', delay: 0,
    save: async () => { order.push('week'); await first.promise; } });
  store.connect({ id: 'deadline', resource: 'week', label: '', href: '', value: 'old', delay: 0, save: async () => { order.push('deadline'); } });
  store.connect({ id: 'other-card', resource: 'other', label: '', href: '', value: false, delay: 0, save: async () => { order.push('other'); } });
  store.edit('week-date', 'new'); store.edit('deadline', 'new'); store.edit('other-card', true); await tick(0);
  assert.deepEqual(order, ['week', 'other']); first.resolve(); await drain(); assert.deepEqual(order, ['week', 'other', 'deadline']);
});
test('invalid fields prevent navigation without stopping valid independent fields', async () => {
  const { store, writes } = fixture();
  store.connect({ id: 'title', resource: 'task', label: '', href: '', value: 'Title', validate: validation.validTitle, save: async () => assert.fail('invalid title sent') });
  store.edit('title', ' '); store.edit('notes', 'valid'); assert.equal(await store.flushAll(), false);
  assert.deepEqual(writes, ['valid']); assert.equal(store.get('title').value, ' ');
  store.edit('title', 'Title'); assert.equal(store.pending().length, 0);
});
test('unmount flushes against the original record, preserves failures, and account disposal stops queued writes', async () => {
  const { store, options, writes, tick } = fixture();
  const detach = store.connect({ ...options, id: 'old-record' });
  store.edit('old-record', 'old draft'); detach(); await drain();
  assert.deepEqual(writes, ['old draft']);
  store.edit('notes', 'never send under next account'); store.dispose(); await tick(1000);
  assert.deepEqual(writes, ['old draft']);
});
test('validates complete dates, local datetimes, titles, schedule times, and IANA timezones', () => {
  for (const value of ['', '2026-1-2', '2026-02-30', '0026-10-23', '2026-13-01']) assert.ok(validation.validDate(value));
  assert.equal(validation.validDate('2028-02-29'), undefined);
  for (const value of ['', '2026-10-23T', '2026-10-23T25:10', '2026-02-30T09:00']) assert.ok(validation.validDateTime(value));
  assert.equal(validation.validDateTime('2026-10-23T09:00'), undefined);
  assert.equal(validation.optionalDateTime(''), undefined);
  assert.ok(validation.validTime('24:01')); assert.equal(validation.validTime('23:59'), undefined);
  assert.ok(validation.validTitle('   ')); assert.equal(validation.validTitle('Task'), undefined);
  assert.ok(validation.validTimezone('Mars/Olympus')); assert.ok(validation.validTimezone(''));
  assert.equal(validation.validTimezone('America/Chicago'), undefined);
});

test('an acknowledged server prop keeps Saved visible; normalization happens only after acknowledgment', async () => {
  const { store, options, writes, tick } = fixture();
  store.sync({ ...options, normalize: value => value.trim() });
  store.edit('notes', '  Trim me  '); assert.equal(store.get('notes').value, '  Trim me  ');
  await tick(650); store.sync({ ...options, value: 'Trim me' });
  assert.deepEqual(writes, ['Trim me']); assert.equal(store.get('notes').value, 'Trim me');
  assert.equal(store.get('notes').status, 'saved');
});
test('an ambiguous network failure still needs a write when the user reverted during the request', async () => {
  const { store, options, writes, tick } = fixture(), first = deferred();
  store.sync({ ...options, save: async value => { writes.push(value); if (value === 'first') await first.promise; } });
  store.edit('notes', 'first'); await tick(650); store.edit('notes', 'original');
  first.reject(Error('response lost')); await drain();
  assert.equal(store.pending().length, 1);
  assert.equal(await store.flushAll(), true); assert.deepEqual(writes, ['first', 'original']);
});
test('a GET overlapping completed writes retries until it reads the current cache generation', async () => {
  const { store } = fixture(), first = deferred(); let reads = 0;
  const result = store.readFresh(async () => ++reads === 1 ? first.promise : 'fresh');
  store.edit('notes', 'change'); await store.flush('notes'); first.resolve('stale');
  assert.equal(await result, 'fresh'); assert.equal(reads, 2);
});
