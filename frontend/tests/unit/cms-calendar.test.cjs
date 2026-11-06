const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(
  __dirname + '/../../lib/cms-calendar.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: exportsForModule, Date, Set, Math, Intl, Number });
const {
  startOfWeek,
  weekDays,
  buildCalendarItems,
  itemsForDay,
  moveToDay,
  moveToDayInZone,
  monthGridDays,
  startOfMonth,
  deliverableIdOf,
  EVENT_COLOR,
  PROJECT_COLORS,
} = exportsForModule;

test('startOfWeek returns Monday 00:00 for a Wednesday', () => {
  const wed = new Date(2024, 4, 15, 13, 45, 30, 123); // Wed May 15 2024
  const monday = startOfWeek(wed);
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getFullYear(), 2024);
  assert.equal(monday.getMonth(), 4);
  assert.equal(monday.getDate(), 13);
  assert.equal(monday.getHours(), 0);
  assert.equal(monday.getMinutes(), 0);
  assert.equal(monday.getSeconds(), 0);
  assert.equal(monday.getMilliseconds(), 0);
});

test('startOfWeek returns Monday 00:00 for a Sunday', () => {
  const sun = new Date(2024, 4, 19, 23, 59, 59, 999); // Sun May 19 2024
  const monday = startOfWeek(sun);
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getFullYear(), 2024);
  assert.equal(monday.getMonth(), 4);
  assert.equal(monday.getDate(), 13);
  assert.equal(monday.getHours(), 0);
  assert.equal(monday.getMinutes(), 0);
  assert.equal(monday.getSeconds(), 0);
  assert.equal(monday.getMilliseconds(), 0);
});

test('weekDays returns 7 consecutive days starting Monday', () => {
  const days = weekDays(new Date(2024, 4, 15, 9, 0, 0));
  assert.equal(days.length, 7);
  for (let i = 0; i < 7; i++) {
    assert.equal(days[i].getDay(), (1 + i) % 7);
    assert.equal(days[i].getHours(), 0);
    if (i > 0) {
      assert.equal(days[i].getTime() - days[i - 1].getTime(), 24 * 60 * 60 * 1000);
    }
  }
});

function projectFixture(id, name, sprintDeliverables) {
  return {
    id,
    name,
    sprints: [{ deliverables: sprintDeliverables }],
  };
}

function deliverableFixture(id, title, deadline) {
  return { id, title, deadline };
}

test('buildCalendarItems makes deliverable items with project colours in project order and draggable only for manageable projects', () => {
  const projects = [
    projectFixture('p1', 'Alpha', [deliverableFixture('d1', 'Ship A', '2024-05-15T10:00:00Z')]),
    projectFixture('p2', 'Beta', [deliverableFixture('d2', 'Ship B', '2024-05-16T09:00:00Z')]),
  ];
  const manageable = new Set(['p2']);
  const items = buildCalendarItems(projects, [], manageable);
  assert.equal(items.length, 2);

  assert.equal(items[0].id, 'deliverable:d1');
  assert.equal(items[0].kind, 'deliverable');
  assert.equal(items[0].title, 'Ship A');
  assert.equal(items[0].projectId, 'p1');
  assert.equal(items[0].projectName, 'Alpha');
  assert.equal(items[0].color, PROJECT_COLORS[0]);
  assert.equal(items[0].draggable, false);

  assert.equal(items[1].id, 'deliverable:d2');
  assert.equal(items[1].projectId, 'p2');
  assert.equal(items[1].color, PROJECT_COLORS[1]);
  assert.equal(items[1].draggable, true);
});

test('events get EVENT_COLOR, projectName OTCR when missing, never draggable', () => {
  const events = [
    { id: 'e1', title: 'Town hall', eventDate: '2024-05-17T14:00:00Z' },
    { id: 'e2', title: 'Review', eventDate: '2024-05-18T08:00:00Z', projectId: 'p1', projectName: 'Alpha' },
  ];
  const items = buildCalendarItems([], events, new Set(['p1']));
  assert.equal(items.length, 2);

  const e1 = items.find((i) => i.id === 'event:e1');
  assert.equal(e1.kind, 'event');
  assert.equal(e1.color, EVENT_COLOR);
  assert.equal(e1.projectName, 'OTCR');
  assert.equal(e1.projectId, null);
  assert.equal(e1.draggable, false);

  const e2 = items.find((i) => i.id === 'event:e2');
  assert.equal(e2.projectName, 'Alpha');
  assert.equal(e2.projectId, 'p1');
  assert.equal(e2.color, EVENT_COLOR);
  assert.equal(e2.draggable, false);
});

test('invalid deliverable and event dates are skipped', () => {
  const projects = [
    projectFixture('p1', 'Alpha', [
      deliverableFixture('bad', 'Bad', 'not-a-date'),
      deliverableFixture('good', 'Good', '2024-05-20T12:00:00Z'),
    ]),
  ];
  const events = [
    { id: 'bad', title: 'Bad', eventDate: 'nope' },
    { id: 'good', title: 'Good', eventDate: '2024-05-21T12:00:00Z' },
  ];
  const items = buildCalendarItems(projects, events, new Set());
  assert.equal(items.length, 2);
  assert.equal(items[0].id, 'deliverable:good');
  assert.equal(items[1].id, 'event:good');
});

test('items are sorted by start ascending', () => {
  const projects = [
    projectFixture('p1', 'Alpha', [
      deliverableFixture('late', 'Late', '2024-05-25T12:00:00Z'),
      deliverableFixture('early', 'Early', '2024-05-21T12:00:00Z'),
    ]),
  ];
  const events = [
    { id: 'mid', title: 'Mid', eventDate: '2024-05-23T12:00:00Z' },
  ];
  const items = buildCalendarItems(projects, events, new Set());
  assert.equal(items.length, 3);
  assert.equal(items[0].id, 'deliverable:early');
  assert.equal(items[1].id, 'event:mid');
  assert.equal(items[2].id, 'deliverable:late');
  for (let i = 1; i < items.length; i++) {
    assert.ok(items[i - 1].start.getTime() <= items[i].start.getTime());
  }
});

test('itemsForDay filters by local day', () => {
  const projects = [
    projectFixture('p1', 'Alpha', [
      deliverableFixture('d1', 'Ship A', '2024-05-15T10:00:00'),
      deliverableFixture('d2', 'Ship B', '2024-05-16T10:00:00'),
    ]),
  ];
  const items = buildCalendarItems(projects, [], new Set());
  const day = new Date(2024, 4, 15, 0, 0, 0);
  const filtered = itemsForDay(items, day);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'deliverable:d1');
});

test('moveToDay keeps hours and minutes', () => {
  const start = new Date(2024, 4, 15, 13, 45, 30, 123);
  const targetDay = new Date(2024, 4, 20, 8, 0, 0, 0);
  const moved = moveToDay(start, targetDay);
  assert.equal(moved.getFullYear(), 2024);
  assert.equal(moved.getMonth(), 4);
  assert.equal(moved.getDate(), 20);
  assert.equal(moved.getHours(), 13);
  assert.equal(moved.getMinutes(), 45);
  assert.equal(moved.getSeconds(), 30);
  assert.equal(moved.getMilliseconds(), 123);
});

test('deliverableIdOf strips the prefix', () => {
  assert.equal(deliverableIdOf({ id: 'deliverable:abc' }), 'abc');
  assert.equal(deliverableIdOf({ id: 'event:xyz' }), 'event:xyz');
  assert.equal(deliverableIdOf({ id: 'plain' }), 'plain');
});

test('moveToDayInZone keeps 17:00 America/Chicago across the November 2026 DST change', () => {
  const start = new Date('2026-10-30T22:00:00Z'); // 17:00 CDT on Fri Oct 30
  const moved = moveToDayInZone(start, new Date(2026, 10, 3), 'America/Chicago');
  assert.equal(moved.toISOString(), '2026-11-03T23:00:00.000Z');
});

test('moveToDayInZone keeps 17:00 America/Chicago across the March 2026 DST change', () => {
  const start = new Date('2026-03-06T23:00:00Z'); // 17:00 CST on Fri Mar 6
  const moved = moveToDayInZone(start, new Date(2026, 2, 9), 'America/Chicago');
  assert.equal(moved.toISOString(), '2026-03-09T22:00:00.000Z');
});

test('moveToDayInZone without a time zone falls back to moveToDay', () => {
  const start = new Date(2024, 4, 15, 13, 45, 30, 123);
  const targetDay = new Date(2024, 4, 20, 8, 0, 0, 0);
  const fallback = moveToDayInZone(start, targetDay);
  const base = moveToDay(start, targetDay);
  assert.equal(fallback.getTime(), base.getTime());
});

test('moveToDayInZone with an invalid time zone falls back to moveToDay', () => {
  const start = new Date(2024, 4, 15, 13, 45, 30, 123);
  const targetDay = new Date(2024, 4, 20, 8, 0, 0, 0);
  const fallback = moveToDayInZone(start, targetDay, 'Not/AZone');
  const base = moveToDay(start, targetDay);
  assert.equal(fallback.getTime(), base.getTime());
});

test('monthGridDays returns 42 consecutive days from the Monday before the 1st', () => {
  const days = monthGridDays(new Date(2026, 10, 18));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.equal(days[0].getFullYear(), 2026);
  assert.equal(days[0].getMonth(), 9);
  assert.equal(days[0].getDate(), 26);
  assert.equal(days[0].getHours(), 0);
  assert.equal(days[0].getMinutes(), 0);
  assert.equal(days[0].getSeconds(), 0);
  assert.equal(days[0].getMilliseconds(), 0);
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1];
    const expected = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1);
    assert.equal(days[i].getFullYear(), expected.getFullYear());
    assert.equal(days[i].getMonth(), expected.getMonth());
    assert.equal(days[i].getDate(), expected.getDate());
    assert.equal(days[i].getHours(), 0);
  }
});

test('startOfMonth returns local midnight on the 1st', () => {
  const start = startOfMonth(new Date(2026, 10, 18, 15, 30, 45, 678));
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 10);
  assert.equal(start.getDate(), 1);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.equal(start.getMilliseconds(), 0);
});
