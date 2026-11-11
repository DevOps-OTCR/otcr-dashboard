const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(
  __dirname + '/../../lib/calendar-sources.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: exportsForModule, URL, URLSearchParams });
const { buildCalendarSources, buildEmbedUrl, CALENDAR_COLORS } =
  exportsForModule;
const FIRM_URL =
  'https://calendar.google.com/calendar/embed?src=otcr%40example.test&ctz=America%2FChicago';

test('firm sources come first with label OTCR events', () => {
  const sources = buildCalendarSources(FIRM_URL, [
    { id: 'p1', name: 'Rocket Team', googleCalendarId: 'rocket@example.test' },
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].kind, 'firm');
  assert.equal(sources[0].label, 'OTCR events');
  assert.equal(sources[0].src, 'otcr@example.test');
  assert.equal(sources[1].kind, 'project');
  assert.equal(sources[1].label, 'Rocket Team');
  assert.equal(sources[1].src, 'rocket@example.test');
});

test('a project without a calendar is skipped', () => {
  const sources = buildCalendarSources(FIRM_URL, [
    { id: 'p1', name: 'No Calendar' },
    { id: 'p2', name: 'Blank', googleCalendarId: '   ' },
    { id: 'p3', name: 'Null', googleCalendarId: null },
    { id: 'p4', name: 'With Calendar', googleCalendarId: 'team@example.test' },
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].label, 'OTCR events');
  assert.equal(sources[1].label, 'With Calendar');
  assert.equal(sources[1].key, 'project:p4');
});

test('duplicate src keeps the first', () => {
  const sources = buildCalendarSources(FIRM_URL, [
    { id: 'p1', name: 'Duplicate of firm', googleCalendarId: 'otcr@example.test' },
    { id: 'p2', name: 'First real', googleCalendarId: 'team@example.test' },
    { id: 'p3', name: 'Second real', googleCalendarId: 'team@example.test' },
  ]);
  assert.equal(sources.length, 2);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(sources.map((s) => s.label))),
    ['OTCR events', 'First real'],
  );
});

test('colours follow CALENDAR_COLORS order', () => {
  const sources = buildCalendarSources(FIRM_URL, [
    { id: 'p1', name: 'One', googleCalendarId: 'one@example.test' },
    { id: 'p2', name: 'Two', googleCalendarId: 'two@example.test' },
  ]);
  assert.equal(sources.length, 3);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(sources.map((s) => s.color))),
    [CALENDAR_COLORS[0], CALENDAR_COLORS[1], CALENDAR_COLORS[2]],
  );
});

test('a non-Google embed URL is ignored', () => {
  const sources = buildCalendarSources(FIRM_URL, [
    { id: 'p1', name: 'Bad host', googleCalendarEmbedUrl: 'https://example.com/calendar/embed?src=x%40example.test' },
    { id: 'p2', name: 'Bad path', googleCalendarEmbedUrl: 'https://calendar.google.com/not-embed?src=y%40example.test' },
    { id: 'p3', name: 'Good', googleCalendarEmbedUrl: 'https://calendar.google.com/calendar/embed?src=good%40example.test' },
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[1].label, 'Good');
  assert.equal(sources[1].src, 'good@example.test');
});

test('buildEmbedUrl emits src/color pairs in selection order and keeps ctz', () => {
  const sources = buildCalendarSources(FIRM_URL, [
    { id: 'p1', name: 'One', googleCalendarId: 'one@example.test' },
    { id: 'p2', name: 'Two', googleCalendarId: 'two@example.test' },
  ]);
  const url = buildEmbedUrl(FIRM_URL, sources);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('ctz'), 'America/Chicago');
  assert.deepStrictEqual(parsed.searchParams.getAll('src'), [
    'otcr@example.test',
    'one@example.test',
    'two@example.test',
  ]);
  assert.deepStrictEqual(parsed.searchParams.getAll('color'), [
    CALENDAR_COLORS[0],
    CALENDAR_COLORS[1],
    CALENDAR_COLORS[2],
  ]);
});

test('empty selection returns the firm URL unchanged', () => {
  assert.equal(buildEmbedUrl(FIRM_URL, []), FIRM_URL);
  assert.equal(buildEmbedUrl(FIRM_URL, undefined), FIRM_URL);
});
