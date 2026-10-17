const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../../when2meet/availability.ts`, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: exportsForModule });
const members = [
  { id: 'a', displayName: 'Alex Lee', email: 'a@example.test' },
  { id: 'b', displayName: 'Alex Lee', email: 'b@example.test' },
  { id: 'c', displayName: 'Casey Morgan', email: 'c@example.test' },
];
const ids = group => Array.from(group, person => person.id);
function poll(slots, roster = members) {
  return exportsForModule.pollAvailability({ members: roster, slots, grid: { totalSlots: 3 } });
}

test('one identity appears in exactly one group, even with duplicate names and duplicate rows', () => {
  const availability = poll([
    { slotIndex: 0, userIds: ['a', 'a', 'former'] }, { slotIndex: 0, userIds: ['a'] },
    { slotIndex: 1, userIds: ['b'] }, { slotIndex: 99, userIds: ['c'] },
  ], [...members, members[0]]);
  const first = availability.forSlot(0), second = availability.forSlot(1);
  assert.deepEqual(ids(first.available), ['a']);
  assert.deepEqual(ids(first.unavailable), ['b']);
  assert.deepEqual(ids(first.unrecorded), ['c']);
  assert.deepEqual(ids(second.available), ['b']);
  assert.deepEqual(ids(second.unavailable), ['a']);
  assert.equal(availability.bySlot.get(0).size, 1);
});

test('everyone available, nobody available, and no recorded slots remain distinct', () => {
  const availability = poll([{ slotIndex: 0, userIds: ['a', 'b', 'c'] }]);
  assert.deepEqual(ids(availability.forSlot(0).available), ['a', 'b', 'c']);
  assert.deepEqual(ids(availability.forSlot(0).unavailable), []);
  assert.deepEqual(ids(availability.forSlot(2).unavailable), ['a', 'b', 'c']);
  assert.deepEqual(ids(poll([]).forSlot(0).unrecorded), ['a', 'b', 'c']);
});

test('names-only legacy responses are identified so the UI does not guess which Alex is available', () => {
  assert.equal(poll([{ slotIndex: 0, names: ['Alex Lee'] }]).hasIdentityData, false);
});
