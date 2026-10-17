const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const frontend = process.env.STAGING_FRONTEND_URL || 'https://otcr-dashboard-staging.onrender.com';
const api = process.env.STAGING_API_URL || 'https://otcr-dashboard-staging-api.onrender.com';
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

async function waitForDeployment() {
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const [backendResponse, frontendResponse] = await Promise.all([
        fetch(`${api}/__meta`, { signal: AbortSignal.timeout(45000), cache: 'no-store' }),
        fetch(`${frontend}/__build.json?revision=${revision}`, {
          signal: AbortSignal.timeout(15000), cache: 'no-store',
        }),
      ]);
      assert.equal(backendResponse.status, 200);
      assert.equal(frontendResponse.status, 200);
      const [backendBuild, frontendBuild] = await Promise.all([
        backendResponse.json(), frontendResponse.json(),
      ]);
      if (backendBuild.render?.gitCommit === revision && frontendBuild.gitCommit === revision) {
        console.log(`Both staging services are running ${revision}`);
        return;
      }
      console.log('Waiting for both Render services to deploy the staging revision');
    } catch (error) {
      console.log(`Waiting for staging: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error(`Staging did not deploy ${revision} within 12 minutes`);
}

async function main() {
  await waitForDeployment();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(frontend, { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/sign-in/**');
    await page.getByRole('button', { name: 'Sign in with NetID', exact: true }).waitFor();
    const result = await page.evaluate(async apiUrl => {
      const response = await fetch(`${apiUrl}/__meta`, { credentials: 'include' });
      return { status: response.status, body: await response.json() };
    }, api);
    assert.equal(result.status, 200);
    assert.equal(result.body.render?.gitCommit, revision);
    const preflight = await fetch(`${api}/auth/me`, {
      method: 'OPTIONS',
      headers: {
        Origin: new URL(frontend).origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
      signal: AbortSignal.timeout(15000),
    });
    assert.ok(preflight.ok, 'Authenticated API preflight failed');
    assert.equal(preflight.headers.get('access-control-allow-origin'), new URL(frontend).origin);
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /authorization/i);
    assert.deepEqual(pageErrors, []);
    console.log('Staging sign-in page, browser API request, and authenticated CORS preflight passed');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
