const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const action = process.argv[2];
const databaseUrl = 'postgresql://otcr_test:local-test-only@127.0.0.1:55439/otcr_cms_test';
const compose = ['compose', '--project-name', 'otcr-cms-test', '--file', path.join(root, 'docker-compose.test.yml')];

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: backend, env, stdio: 'inherit' });
  if (result.error) {
    console.error(`Unable to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!['up', 'down', 'status', 'test'].includes(action)) {
  console.error('Usage: node scripts/cms-test-db.cjs up|down|status|test');
  process.exit(1);
}

// Explicit Compose file/project keep these operations scoped to the test database.
// Refuse remote engines: this command is for a contributor's local workstation.
const context = spawnSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' });
const host = process.env.DOCKER_CONTEXT ? context.stdout?.trim() : process.env.DOCKER_HOST || context.stdout?.trim();
if (!host || !/^(unix:|npipe:|tcp:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$))/.test(host)) {
  console.error('Use a local Docker engine and ensure Docker Desktop is running.');
  process.exit(1);
}

if (action === 'down') {
  run('docker', [...compose, 'down']);
} else if (action === 'status') {
  run('docker', [...compose, 'ps']);
} else {
  run('docker', [...compose, 'up', '--detach', '--wait', '--wait-timeout', '60', 'postgres']);
  console.log('Local test PostgreSQL is ready at 127.0.0.1:55439 (database: otcr_cms_test).');
  if (action === 'test') {
    // Never inherit a developer's live DATABASE_URL or DIRECT_URL for this command.
    const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, CMS_READ_TEST_DATABASE_URL: databaseUrl };
    run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'generate'], env);
    run(process.execPath, [path.join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath',
      'src/agentic-cms/reads/cms-read.integration.spec.ts',
      'src/agentic-cms/mcp/mcp.integration.spec.ts', ...process.argv.slice(3)], env);
  }
}
