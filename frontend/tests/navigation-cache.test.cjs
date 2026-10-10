const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup() {
  let now = 0;
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../lib/navigation-cache.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date: { now: () => now } });
  return { ...exports, advance: ms => { now += ms; } };
}

test('return visits reuse data until the two-minute expiry', () => {
  const cache = setup();
  const data = { selectedProjectId: 'team-2', events: [{ id: 'event-1' }] };
  cache.writeNavigationSnapshot('attendance:user:PM', data);
  assert.equal(cache.readNavigationSnapshot('attendance:user:PM'), data);
  cache.advance(119999);
  assert.equal(cache.readNavigationSnapshot('attendance:user:PM'), data);
  cache.advance(1);
  assert.equal(cache.readNavigationSnapshot('attendance:user:PM'), undefined);
});

test('pages, accounts, and role overrides have separate snapshots', () => {
  const cache = setup();
  cache.writeNavigationSnapshot('slides:user-1:PM', { private: true });
  for (const key of ['attendance:user-1:PM', 'slides:user-2:PM', 'slides:user-1:CONSULTANT']) {
    assert.equal(cache.readNavigationSnapshot(key), undefined);
  }
});

test('invalidating after a write or logout removes every snapshot', () => {
  const cache = setup();
  cache.writeNavigationSnapshot('slides:user:PM', []);
  cache.writeNavigationSnapshot('deliverables:user:PM', []);
  cache.clearNavigationSnapshots();
  assert.equal(cache.readNavigationSnapshot('slides:user:PM'), undefined);
  assert.equal(cache.readNavigationSnapshot('deliverables:user:PM'), undefined);
  cache.writeNavigationSnapshot('slides:user:PM', ['updated']);
  assert.equal(cache.readNavigationSnapshot('slides:user:PM')[0], 'updated');
});
