const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(
  __dirname + '/../../lib/workstream-weeks.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: exportsForModule });
const { deliverablesInSprint } = exportsForModule;

const ids = (items) => items.map((item) => item.id);

test('ordinary titles without a week number stay in their sprint', () => {
  const week3 = {
    id: 'sprint-3',
    label: 'Week 3',
    deliverables: [
      { id: 'd1', sprintId: 'sprint-3', title: 'Client memo' },
      { id: 'd2', sprintId: 'sprint-3', title: 'Market sizing deck' },
      { id: 'd3', title: 'Interview notes' },
    ],
  };
  assert.deepEqual(ids(deliverablesInSprint(week3)), ['d1', 'd2', 'd3']);
});

test('titles naming another week do not move a deliverable', () => {
  const week3 = {
    id: 'sprint-3',
    label: 'Week 3',
    deliverables: [{ id: 'd1', sprintId: 'sprint-3', title: 'Week 1 follow-up' }],
  };
  assert.deepEqual(ids(deliverablesInSprint(week3)), ['d1']);
});

test('multiple weeks each keep only their own deliverables', () => {
  const shared = [
    { id: 'a', sprintId: 'sprint-1', title: 'Kickoff' },
    { id: 'b', sprintId: 'sprint-2', title: 'Research' },
  ];
  assert.deepEqual(ids(deliverablesInSprint({ id: 'sprint-1', deliverables: shared })), ['a']);
  assert.deepEqual(ids(deliverablesInSprint({ id: 'sprint-2', deliverables: shared })), ['b']);
});

test('reordering weeks does not change membership', () => {
  const sprints = [
    { id: 'sprint-1', label: 'Week 1', deliverables: [{ id: 'a', sprintId: 'sprint-1', title: 'Kickoff' }] },
    { id: 'sprint-2', label: 'Week 2', deliverables: [{ id: 'b', sprintId: 'sprint-2', title: 'Research' }] },
    { id: 'sprint-3', label: 'Week 3', deliverables: [{ id: 'c', sprintId: 'sprint-3', title: 'Client memo' }] },
  ];
  const byId = (list) => Object.fromEntries(list.map((s) => [s.id, ids(deliverablesInSprint(s))]));
  assert.deepEqual(byId([...sprints].reverse()), byId(sprints));
});

test('a week with no deliverables is empty', () => {
  assert.equal(deliverablesInSprint({ id: 'sprint-4', deliverables: [] }).length, 0);
  assert.equal(deliverablesInSprint({ id: 'sprint-4' }).length, 0);
});
