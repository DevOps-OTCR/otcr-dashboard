const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(
  __dirname + '/../../lib/slack-role-suggestions.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: exportsForModule });
const { canReviewSlackRoleSuggestions } = exportsForModule;

test('only a real ADMIN role can review Slack role suggestions', () => {
  assert.equal(canReviewSlackRoleSuggestions('ADMIN'), true);
});

test('every non-ADMIN value is rejected, including case variants', () => {
  for (const role of ['CONSULTANT', 'LC', 'PM', 'PARTNER', 'EXECUTIVE', 'admin']) {
    assert.equal(canReviewSlackRoleSuggestions(role), false);
  }
});

test('missing, empty, nullish and object values are rejected', () => {
  assert.equal(canReviewSlackRoleSuggestions(''), false);
  assert.equal(canReviewSlackRoleSuggestions(null), false);
  assert.equal(canReviewSlackRoleSuggestions(undefined), false);
  assert.equal(canReviewSlackRoleSuggestions({}), false);
});
