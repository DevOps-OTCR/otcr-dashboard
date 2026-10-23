const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(
  __dirname + '/../../components/people/types.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: exportsForModule });
const { safePersonName } = exportsForModule;
const person = { email: 'casey@example.test', firstName: 'Casey', lastName: 'Test' };

test('missing, whitespace, email-like and encoded names fall back to email', () => {
  const encoded = Buffer.from(JSON.stringify({ oid: 'fixture' })).toString('base64url');
  for (const firstName of [null, '', '   ', 'other@example.test', encoded, 'header.payload.signature']) {
    assert.equal(safePersonName({ ...person, firstName, lastName: null }), person.email);
  }
  assert.equal(safePersonName({ ...person, lastName: encoded }), person.email);
});

test('readable names are trimmed and preserved without arbitrary truncation', () => {
  assert.equal(safePersonName({ ...person, firstName: '  Jos\u00e9  ', lastName: ' Mu\u00f1oz ' }), 'Jos\u00e9 Mu\u00f1oz');
  const firstName = 'Alexandria Catherine Elizabeth';
  const lastName = 'Montgomery Richardson';
  assert.equal(safePersonName({ ...person, firstName, lastName }), firstName + ' ' + lastName);
});
