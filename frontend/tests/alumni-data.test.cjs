const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Run the real TypeScript module so the page and the tests share one implementation.
function load() {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../lib/alumni-data.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  vm.runInNewContext(code, { exports });
  return exports;
}

const { filterAlumni, sortAlumni, DEFAULT_ALUMNI_SORT } = load();

let nextId = 1;
function row(fields) {
  return { id: nextId++, fields };
}

const rows = [
  row({ name: 'Dana Lee', graduationyear: '2021', currentemployer: 'McKinsey', currentjobtitle: 'Associate', major: 'Finance' }),
  row({ name: 'alex Kim', graduationyear: '2019', currentemployer: 'google', currentjobtitle: 'Product Manager' }),
  row({ name: 'Chris Park', graduationyear: '', currentemployer: '', currentjobtitle: 'Founder', currentindustry: 'Tech' }),
  row({ name: 'Bea Cruz', graduationyear: '2023', currentemployer: 'Bain', currentjobtitle: '' }),
  row({ name: 'Eli Stone', graduationyear: '999', currentemployer: 'Amazon' }),
];

const names = (list) => list.map((r) => r.fields.name);

test('search is case-insensitive across name, employer, and title', () => {
  assert.deepEqual(names(filterAlumni(rows, 'ALEX')), ['alex Kim']);
  assert.deepEqual(names(filterAlumni(rows, 'GOOGLE')), ['alex Kim']);
  assert.deepEqual(names(filterAlumni(rows, 'founder')), ['Chris Park']);
  assert.deepEqual(names(filterAlumni(rows, '  mckinsey ')), ['Dana Lee']);
});

test('a match in any field includes the record', () => {
  const extra = row({ name: 'Bain Fan', currentemployer: 'Deloitte' });
  assert.deepEqual(names(filterAlumni([...rows, extra], 'bain')), ['Bea Cruz', 'Bain Fan']);
});

test('missing fields and no matches do not throw', () => {
  assert.deepEqual(filterAlumni([row({})], 'x'), []);
  assert.deepEqual(filterAlumni(rows, 'no such person'), []);
  assert.equal(sortAlumni([row({}), row({})], { key: 'jobTitle', direction: 'desc' }).length, 2);
});

test('blank search returns every record', () => {
  assert.equal(filterAlumni(rows, '   ').length, rows.length);
});

test('text columns sort case-insensitively in both directions', () => {
  assert.deepEqual(names(sortAlumni(rows, { key: 'name', direction: 'asc' })), [
    'alex Kim', 'Bea Cruz', 'Chris Park', 'Dana Lee', 'Eli Stone',
  ]);
  assert.deepEqual(names(sortAlumni(rows, { key: 'name', direction: 'desc' })), [
    'Eli Stone', 'Dana Lee', 'Chris Park', 'Bea Cruz', 'alex Kim',
  ]);
});

test('missing values sort last in both directions', () => {
  assert.deepEqual(names(sortAlumni(rows, { key: 'employer', direction: 'asc' })), [
    'Eli Stone', 'Bea Cruz', 'alex Kim', 'Dana Lee', 'Chris Park',
  ]);
  assert.deepEqual(names(sortAlumni(rows, { key: 'employer', direction: 'desc' })), [
    'Dana Lee', 'alex Kim', 'Bea Cruz', 'Eli Stone', 'Chris Park',
  ]);
});

test('class year sorts numerically and unparseable years sort last', () => {
  const years = (dir) =>
    sortAlumni(rows, { key: 'graduationYear', direction: dir }).map((r) => r.fields.graduationyear);
  assert.deepEqual(years('asc'), ['2019', '2021', '2023', '', '999']);
  assert.deepEqual(years('desc'), ['2023', '2021', '2019', '', '999']);
});

test('ties fall back to name order', () => {
  const tied = [row({ name: 'Zed', currentemployer: 'Bain' }), row({ name: 'amy', currentemployer: 'bain' })];
  assert.deepEqual(names(sortAlumni(tied, { key: 'employer', direction: 'desc' })), ['amy', 'Zed']);
});

test('clearing the search restores all records in the selected sort', () => {
  const sort = { key: 'name', direction: 'desc' };
  assert.deepEqual(names(sortAlumni(filterAlumni(rows, 'MA'), sort)), ['Eli Stone', 'alex Kim']);
  assert.deepEqual(names(sortAlumni(filterAlumni(rows, ''), sort)), names(sortAlumni(rows, sort)));
});

test('default sort keeps the original employer-then-name order', () => {
  assert.equal(DEFAULT_ALUMNI_SORT.key, 'employer');
  assert.equal(DEFAULT_ALUMNI_SORT.direction, 'asc');
});

test('sorting does not mutate the input', () => {
  const before = names(rows);
  sortAlumni(rows, { key: 'name', direction: 'asc' });
  assert.deepEqual(names(rows), before);
});
