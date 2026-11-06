const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(
  __dirname + '/../../lib/pm-tools.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: exportsForModule, Date, Set, Math, Number });
const { summarizePmProjects, canSeePmTools } = exportsForModule;
const now = new Date(2026, 10, 4, 12, 0);
const iso = (d, h) => new Date(2026, 10, d, h).toISOString();

const deliverable = (over) => ({
  id: 'd-' + Math.random().toString(36).slice(2),
  title: 'Deliverable',
  deadline: iso(5, 12),
  status: 'IN_PROGRESS',
  completed: false,
  ...over,
});
const project = (over) => ({ id: 'p1', name: 'Project One', sprints: [], ...over });

test('draftSprints counts only sprints with status DRAFT', () => {
  const result = summarizePmProjects([project({
    sprints: [
      { status: 'DRAFT', deliverables: [] },
      { status: 'ACTIVE', deliverables: [] },
      { status: 'DRAFT', deliverables: [] },
      { deliverables: [] },
      { status: 'draft', deliverables: [] },
    ],
  })], now);
  assert.equal(result[0].draftSprints, 2);
});

test('overdue counts open deliverables before now across all sprint statuses and skips closed ones', () => {
  const result = summarizePmProjects([project({
    sprints: [
      { status: 'DRAFT', deliverables: [
        deliverable({ id: 'past-1', deadline: iso(3, 9), status: 'IN_PROGRESS', completed: false }),
        deliverable({ id: 'sub', deadline: iso(3, 9), status: 'SUBMITTED', completed: false }),
        deliverable({ id: 'app', deadline: iso(3, 9), status: 'APPROVED', completed: false }),
        deliverable({ id: 'done', deadline: iso(3, 9), status: 'IN_PROGRESS', completed: true }),
        deliverable({ id: 'today-earlier', deadline: iso(4, 9), status: 'IN_PROGRESS', completed: false }),
        deliverable({ id: 'exactly-now', deadline: iso(4, 12), status: 'IN_PROGRESS', completed: false }),
        deliverable({ id: 'future', deadline: iso(6, 12), status: 'IN_PROGRESS', completed: false }),
      ] },
      { status: 'ACTIVE', deliverables: [
        deliverable({ id: 'past-2', deadline: iso(1, 0), status: 'IN_PROGRESS', completed: false }),
        deliverable({ id: 'past-3', deadline: iso(3, 23), status: 'PENDING', completed: false }),
      ] },
    ],
  })], now);
  assert.equal(result[0].overdue, 4);
});

test('dueThisWeek counts open deliverables from now through Sunday Nov 8 23:59:59.999 local and excludes Monday Nov 9', () => {
  const result = summarizePmProjects([project({
    sprints: [
      { status: 'ACTIVE', deliverables: [
        deliverable({ id: 'before', deadline: iso(4, 11), status: 'IN_PROGRESS', completed: false }),
        deliverable({ id: 'now', deadline: iso(4, 12), status: 'IN_PROGRESS', completed: false }),
        deliverable({ id: 'fri', deadline: iso(6, 12), status: 'IN_PROGRESS', completed: false }),
        deliverable({ id: 'sunday-late', deadline: iso(8, 23), status: 'IN_PROGRESS', completed: false }),
        deliverable({ id: 'monday', deadline: iso(9, 0), status: 'IN_PROGRESS', completed: false }),
        deliverable({ id: 'closed', deadline: iso(6, 12), status: 'APPROVED', completed: false }),
        deliverable({ id: 'completed', deadline: iso(6, 12), status: 'IN_PROGRESS', completed: true }),
      ] },
    ],
  })], now);
  assert.equal(result[0].dueThisWeek, 3);
  assert.equal(result[0].overdue, 1);
});

test('nextDeadline is the earliest open future deliverable, comparing title and getTime', () => {
  const result = summarizePmProjects([project({
    sprints: [
      { status: 'ACTIVE', deliverables: [
        deliverable({ id: 'late', title: 'Late', deadline: iso(20, 12) }),
        deliverable({ id: 'soon', title: 'Soon', deadline: iso(5, 9) }),
        deliverable({ id: 'mid', title: 'Mid', deadline: iso(6, 12) }),
        deliverable({ id: 'past', title: 'Past', deadline: iso(1, 12) }),
        deliverable({ id: 'closedSoon', title: 'ClosedSoon', deadline: iso(4, 13), status: 'SUBMITTED' }),
      ] },
    ],
  })], now);
  assert.equal(result[0].nextDeadline.title, 'Soon');
  assert.equal(result[0].nextDeadline.deadline.getTime(), new Date(iso(5, 9)).getTime());
});

test('invalid deadline strings are ignored for overdue, dueThisWeek and nextDeadline', () => {
  const result = summarizePmProjects([project({
    sprints: [
      { status: 'ACTIVE', deliverables: [
        deliverable({ id: 'bad-1', deadline: 'not-a-date' }),
        deliverable({ id: 'bad-2', deadline: '' }),
        deliverable({ id: 'bad-3', deadline: '2026-13-40T99:99:99.999Z' }),
        deliverable({ id: 'good', title: 'Good', deadline: iso(5, 12) }),
      ] },
    ],
  })], now);
  assert.equal(result[0].overdue, 0);
  assert.equal(result[0].dueThisWeek, 1);
  assert.equal(result[0].nextDeadline.title, 'Good');
});

test('empty sprints produce zeros and null nextDeadline', () => {
  const result = summarizePmProjects([project({ sprints: [] })], now);
  assert.equal(result[0].draftSprints, 0);
  assert.equal(result[0].overdue, 0);
  assert.equal(result[0].dueThisWeek, 0);
  assert.equal(result[0].nextDeadline, null);
});

test('input project order is preserved in the result', () => {
  const projects = [
    project({ id: 'b', name: 'Beta', sprints: [] }),
    project({ id: 'a', name: 'Alpha', sprints: [] }),
    project({ id: 'c', name: 'Gamma', sprints: [] }),
  ];
  const result = summarizePmProjects(projects, now);
  assert.equal(JSON.stringify(result.map((p) => p.id)), JSON.stringify(['b', 'a', 'c']));
  assert.equal(JSON.stringify(result.map((p) => p.name)), JSON.stringify(['Beta', 'Alpha', 'Gamma']));
});

test('canSeePmTools is true for ADMIN, LC and PM and false for other roles', () => {
  assert.equal(canSeePmTools('ADMIN'), true);
  assert.equal(canSeePmTools('LC'), true);
  assert.equal(canSeePmTools('PM'), true);
  assert.equal(canSeePmTools('CONSULTANT'), false);
  assert.equal(canSeePmTools('PARTNER'), false);
  assert.equal(canSeePmTools('EXECUTIVE'), false);
 
});
test('project order is preserved for a single project and list length is preserved', () => {
  const projects = [project({ id: 'only', name: 'Only', sprints: [] })];
  const result = summarizePmProjects(projects, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'only');
  assert.equal(result[0].name, 'Only');
});

test('summarizePmProjects keeps order and apply over 4 projects', () => {
  const projects = [
    project({ id: 'p1', name: 'One', sprints: [] }),
    project({ id: 'p2', name: 'Two', sprints: [] }),
    project({ id: 'p3', name: 'Three', sprints: [] }),
    project({ id: 'p4', name: 'Four', sprints: [] }),
  ];
  const result = summarizePmProjects(projects, now);
  assert.equal(result.length, 4);
  assert.equal(result[0].id, 'p1');
  assert.equal(result[1].id, 'p2');
  assert.equal(result[2].id, 'p3');
  assert.equal(result[3].id, 'p4');
});

test('real Prisma statuses: OVERDUE counts as overdue and PENDING due Friday counts as due this week', () => {
  const result = summarizePmProjects([project({
    sprints: [
      { status: 'ACTIVE', deliverables: [
        deliverable({ id: 'od', status: 'OVERDUE', deadline: iso(2, 9) }),
        deliverable({ id: 'pf', status: 'PENDING', deadline: iso(6, 12) }),
      ] },
    ],
  })], now);
  assert.equal(result[0].overdue, 1);
  assert.equal(result[0].dueThisWeek, 1);
});
