const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Run the real TypeScript module with an isolated browser cache and API double.
function setup(responses) {
  const cache = new Map();
  const calls = [];
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../lib/permissions.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, window: {}, console,
    localStorage: {
      getItem: key => cache.get(key) ?? null,
      setItem: (key, value) => cache.set(key, value),
      removeItem: key => cache.delete(key),
    },
    require: name => {
      assert.equal(name, './api');
      return { api: { get: async (...args) => {
        calls.push(args);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return { data: response };
      } } };
    },
  });
  return { ...exports, cache, calls };
}

test('failure is not cached; recovery calls the API and routes to PM immediately', async () => {
  const context = setup([new Error('503'), { role: 'PM' }]);
  await assert.rejects(context.getDefaultDashboardPathForUser('test-token', 'pm@example.test'));
  assert.equal(context.cache.size, 0);
  assert.equal(await context.getDefaultDashboardPathForUser('test-token', 'pm@example.test'), '/pm');
  assert.equal(context.calls.length, 2);
  assert.equal(JSON.parse(context.cache.get('otcr_role_cache:pm@example.test')).role, 'PM');
  assert.equal(await context.getDefaultDashboardPathForUser('test-token', 'PM@example.test'), '/pm');
  assert.equal(context.calls.length, 2);
});

for (const response of [null, {}, { role: 'UNKNOWN' }, { role: 123 }]) {
  test(`invalid response ${JSON.stringify(response)} is never cached`, async () => {
    const context = setup([response]);
    await assert.rejects(context.getEffectiveRole('test-token', 'user@example.test'));
    assert.equal(context.cache.size, 0);
  });
}

for (const [role, path] of Object.entries({
  CONSULTANT: '/consultant', LC: '/lc', PM: '/pm', PARTNER: '/partner', EXECUTIVE: '/partner', ADMIN: '/pm',
})) {
  test(`API-confirmed ${role} is cached and routed correctly`, async () => {
    const context = setup([{ role }]);
    assert.equal(await context.getDefaultDashboardPathForUser('test-token', 'user@example.test'), path);
    assert.equal(JSON.parse(context.cache.get('otcr_role_cache:user@example.test')).role, role);
    assert.equal(context.calls[0][0], '/auth/role');
    assert.equal(context.calls[0][1].headers.Authorization, 'Bearer test-token');
  });
}

test('missing credentials do not write a role or call the API', async () => {
  const context = setup([]);
  await assert.rejects(context.getEffectiveRole(null, 'user@example.test'));
  assert.equal(context.cache.size, 0);
  assert.equal(context.calls.length, 0);
});

test('a legacy fallback cache entry is discarded instead of masking recovery', async () => {
  const context = setup([{ role: 'PM' }]);
  context.cache.set('otcr_role_cache:user@example.test', JSON.stringify({
    role: 'CONSULTANT', cachedAt: Date.now(),
  }));
  assert.equal(await context.getDefaultDashboardPathForUser('test-token', 'user@example.test'), '/pm');
  assert.equal(context.calls.length, 1);
  assert.equal(JSON.parse(context.cache.get('otcr_role_cache:user@example.test')).source, 'api');
});
