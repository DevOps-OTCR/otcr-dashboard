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
  const apiExports = {};
  const cacheModules = {};
  for (const name of ['navigation-cache', 'resource-cache']) {
    const cacheExports = {};
    const cacheCode = ts.transpileModule(fs.readFileSync(`${__dirname}/../lib/${name}.ts`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
    }).outputText;
    vm.runInNewContext(cacheCode, { exports: cacheExports });
    cacheModules[`./${name}`] = cacheExports;
  }
  const apiCode = ts.transpileModule(fs.readFileSync(`${__dirname}/../lib/api.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  vm.runInNewContext(apiCode, {
    exports: apiExports,
    process: { env: {} },
    require: name => {
      if (cacheModules[name]) return cacheModules[name];
      assert.equal(name, 'axios');
      return { default: { create: () => ({
        interceptors: { response: { use: () => {} } },
        get: async (...args) => {
          calls.push(args);
          const response = responses.shift();
          if (response instanceof Error) throw response;
          return { data: response };
      } }) } };
    },
  });
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
      if (cacheModules[name]) return cacheModules[name];
      assert.equal(name, './api');
      return apiExports;
    },
  });
  return { ...exports, cache, calls, cacheModules };
}

test('failure is not cached; recovery calls the API and routes to Overview immediately', async () => {
  const context = setup([new Error('503'), { role: 'PM' }]);
  await assert.rejects(context.getDefaultDashboardPathForUser('test-token', 'pm@example.test'));
  assert.equal(context.cache.size, 0);
  assert.equal(await context.getDefaultDashboardPathForUser('test-token', 'pm@example.test'), '/overview');
  assert.equal(context.calls.length, 2);
  assert.equal(JSON.parse(context.cache.get('otcr_role_cache:pm@example.test')).role, 'PM');
  assert.equal(await context.getDefaultDashboardPathForUser('test-token', 'PM@example.test'), '/overview');
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
  CONSULTANT: '/consultant', LC: '/overview', PM: '/overview', PARTNER: '/overview', EXECUTIVE: '/overview', ADMIN: '/overview',
})) {
  test(`API-confirmed ${role} is cached and routed correctly`, async () => {
    const context = setup([{ role }]);
    assert.equal(await context.getDefaultDashboardPathForUser('test-token', 'user@example.test'), path);
    assert.equal(JSON.parse(context.cache.get('otcr_role_cache:user@example.test')).role, role);
    assert.equal(context.calls[0][0], '/auth/role');
    assert.equal(context.calls[0][1].headers.Authorization, 'Bearer test-token');
  });
}

test('a changed API role clears page data cached under the previous permissions', async () => {
  const context = setup([{ role: 'PM' }, { role: 'CONSULTANT' }]);
  const resources = context.cacheModules['./resource-cache'];
  const snapshots = context.cacheModules['./navigation-cache'];
  assert.equal(await context.getEffectiveRole('test-token', 'user@example.test'), 'PM');
  await resources.cachedRequest('/projects', async () => ({ data: 'pm projects' }));
  snapshots.writeNavigationSnapshot('overview', ['pm projects']);
  context.clearRoleCache('user@example.test');
  context.cache.clear();
  assert.equal(await context.getEffectiveRole('test-token', 'user@example.test'), 'CONSULTANT');
  assert.equal(resources.readResource('/projects'), undefined);
  assert.equal(snapshots.readNavigationSnapshot('overview'), undefined);
});

test('a role that changes after the stored role expires clears cached page data', async () => {
  const context = setup([{ role: 'CONSULTANT' }]);
  const resources = context.cacheModules['./resource-cache'];
  context.cache.set('otcr_role_cache:user@example.test', JSON.stringify({ role: 'PM', cachedAt: Date.now(), source: 'api' }));
  assert.equal(await context.getEffectiveRole('test-token', 'user@example.test'), 'PM');
  await resources.cachedRequest('/projects', async () => ({ data: 'pm projects' }));
  context.cache.clear();
  assert.equal(await context.getEffectiveRole('test-token', 'user@example.test'), 'CONSULTANT');
  assert.equal(resources.readResource('/projects'), undefined);
});

test('confirming the same role keeps cached page data', async () => {
  const context = setup([{ role: 'PM' }, { role: 'PM' }]);
  const resources = context.cacheModules['./resource-cache'];
  assert.equal(await context.getEffectiveRole('test-token', 'user@example.test'), 'PM');
  await resources.cachedRequest('/projects', async () => ({ data: 'pm projects' }));
  context.cache.clear();
  assert.equal(await context.getEffectiveRole('test-token', 'user@example.test'), 'PM');
  assert.deepEqual(resources.readResource('/projects'), { data: 'pm projects' });
});

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
  assert.equal(await context.getDefaultDashboardPathForUser('test-token', 'user@example.test'), '/overview');
  assert.equal(context.calls.length, 1);
  assert.equal(JSON.parse(context.cache.get('otcr_role_cache:user@example.test')).source, 'api');
});
