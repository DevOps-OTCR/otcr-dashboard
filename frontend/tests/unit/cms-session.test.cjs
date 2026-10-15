const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function tab(localStorage = storage()) {
  const exports = {};
  const sessionStorage = storage();
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../../lib/cms-session.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  vm.runInNewContext(code, { exports, localStorage, sessionStorage, crypto: { randomUUID }, setTimeout, clearTimeout });
  return { ...exports, localStorage, sessionStorage };
}

test('sign-out is durable across independent tabs and reloads', () => {
  const first = tab();
  first.beginCmsSignIn();
  assert.equal(first.completeCmsSignIn('account-1'), true);
  const second = tab(first.localStorage);
  assert.equal(second.readCmsSession().accountId, 'account-1');
  second.markCmsSignedOut();
  assert.equal(first.readCmsSession().signedOut, true);
  assert.equal(tab(first.localStorage).readCmsSession().signedOut, true);
  assert.equal(tab(first.localStorage).completeCmsSignIn('stale-account'), false);
});

test('a successful explicit sign-in can restore the CMS after local sign-out', () => {
  const first = tab();
  first.markCmsSignedOut();
  first.beginCmsSignIn();
  assert.equal(first.completeCmsSignIn('account-2'), true);
  assert.equal(first.readCmsSession().signedOut, false);
  assert.equal(tab(first.localStorage).readCmsSession().accountId, 'account-2');
});

test('sign-out in another tab rejects an earlier login redirect result', () => {
  const first = tab();
  first.beginCmsSignIn();
  const second = tab(first.localStorage);
  second.markCmsSignedOut();
  assert.equal(first.completeCmsSignIn('late-account'), false);
  assert.equal(first.readCmsSession().signedOut, true);
});

test('a stale redirect cannot replace a newer signed-in account', () => {
  const first = tab();
  first.beginCmsSignIn();
  const second = tab(first.localStorage);
  second.beginCmsSignIn();
  assert.equal(second.completeCmsSignIn('new-account'), true);
  assert.equal(first.completeCmsSignIn('old-account'), false);
  assert.equal(first.readCmsSession().accountId, 'new-account');
});

test('unfinished authentication times out, and successful operations return normally', async () => {
  const session = tab();
  await assert.rejects(session.withAuthTimeout(new Promise(() => {}), 5), /timed out/);
  assert.equal(await session.withAuthTimeout(Promise.resolve('token'), 100), 'token');
});
