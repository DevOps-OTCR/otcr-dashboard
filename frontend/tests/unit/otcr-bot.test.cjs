const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Loads a dependency-free TypeScript module from the Agentic CMS feature folder.
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../../features/agentic-cms/${file}`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  vm.runInNewContext(code, { exports });
  return exports;
}

const { createSseParser } = load('sse.ts');
const { CITATION_PREFIX, linkCitations, withSourceList } = load('citations.ts');
const parse = (...chunks) => {
  const events = [];
  const push = createSseParser(e => events.push(e));
  chunks.forEach(push);
  return JSON.parse(JSON.stringify(events));
};

test('SSE: parses complete frames in order', () => {
  assert.deepEqual(parse('data: {"type":"text_delta","text":"Hi"}\n\ndata: {"type":"done"}\n\n'), [
    { type: 'text_delta', text: 'Hi' },
    { type: 'done' },
  ]);
});

test('SSE: reassembles a frame split across network chunks', () => {
  assert.deepEqual(parse('data: {"type":"text_', 'delta","text":"Hel', 'lo"}\n', '\n'), [{ type: 'text_delta', text: 'Hello' }]);
});

test('SSE: ignores heartbeats and malformed frames, accepts CRLF', () => {
  assert.deepEqual(parse(': ping\n\n', 'data: {not json}\n\n', 'data: {"type":"done"}\r\n\r\n'), [{ type: 'done' }]);
});

test('SSE: waits for the blank line before emitting', () => {
  assert.deepEqual(parse('data: {"type":"done"}\n'), []);
});

const sources = [
  { id: 1, title: 'A', url: 'https://a.test/x' },
  { id: 2, title: 'B', url: 'https://b.test/y' },
];
const link = id => `[\\[${id}\\]](${CITATION_PREFIX}${id})`;

test('citations: links only backend sources; invented [n] stay plain text', () => {
  assert.equal(linkCitations('Growing [1], rivals [2], invented [99].', sources), `Growing ${link(1)}, rivals ${link(2)}, invented [99].`);
});

test('citations: leaves code and existing markdown links alone', () => {
  assert.equal(linkCitations('Use `list[1]` here.', sources), 'Use `list[1]` here.');
  assert.equal(linkCitations('```\nrows[2]\n```', sources), '```\nrows[2]\n```');
  assert.equal(linkCitations('See [1](https://example.com).', sources), 'See [1](https://example.com).');
});

test('citations: never links a source without an http(s) URL', () => {
  assert.equal(linkCitations('Claim [1].', [{ id: 1, title: 'x', url: 'javascript:alert(1)' }]), 'Claim [1].');
  assert.equal(linkCitations('Claim [1].', []), 'Claim [1].');
});

const { pickWorkstream } = load('workstream.ts');
const week = (id, start, end) => ({ id, name: id, weekStartDate: `${start}T00:00:00.000Z`, weekEndDate: `${end}T00:00:00.000Z` });
const weeks = [week('w3', '2026-11-16', '2026-11-22'), week('w2', '2026-11-09', '2026-11-15'), week('w1', '2026-11-02', '2026-11-08')]; // newest first, like the API
const chicago = 'America/Chicago';

test('workstream: picks the week containing today, whatever the list order', () => {
  const now = new Date('2026-11-11T18:00:00Z');
  assert.equal(pickWorkstream(weeks, '', chicago, now), 'w2');
  assert.equal(pickWorkstream([...weeks].reverse(), '', chicago, now), 'w2');
});

test('workstream: decides today in the project timezone', () => {
  const sundayNightInChicago = new Date('2026-11-09T03:00:00Z'); // already Monday in UTC
  assert.equal(pickWorkstream(weeks, '', chicago, sundayNightInChicago), 'w1');
  assert.equal(pickWorkstream(weeks, '', 'UTC', sundayNightInChicago), 'w2');
});

test('workstream: keeps a selection that is still listed', () => {
  assert.equal(pickWorkstream(weeks, 'w3', chicago, new Date('2026-11-11T18:00:00Z')), 'w3');
});

test('workstream: replaces a selection that is no longer listed', () => {
  assert.equal(pickWorkstream(weeks, 'gone', chicago, new Date('2026-11-11T18:00:00Z')), 'w2');
});

test('workstream: leaves No workstream selected when no released week contains today', () => {
  assert.equal(pickWorkstream(weeks, '', chicago, new Date('2026-12-25T18:00:00Z')), '');
  assert.equal(pickWorkstream(weeks, '', chicago, new Date('2026-10-01T18:00:00Z')), '');
  assert.equal(pickWorkstream([], '', chicago, new Date('2026-11-11T18:00:00Z')), '');
});

test('workstream: an unrecognized project timezone falls back to Chicago', () => {
  assert.equal(pickWorkstream(weeks, '', 'Not/AZone', new Date('2026-11-09T03:00:00Z')), 'w1');
});

test('citations: copied text appends a numbered source list', () => {
  assert.equal(withSourceList('Answer [1].', sources.slice(0, 1)), 'Answer [1].\n\nSources:\n[1] A https://a.test/x');
  assert.equal(withSourceList('No sources.', []), 'No sources.');
});
