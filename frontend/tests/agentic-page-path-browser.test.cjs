const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildBundle, document } = require('./navigation-browser/bundle.cjs');

// The real AgenticCmsFeature gate and Agentic CMS page, with synthetic auth, flag and
// context responses. Static builds use trailingSlash, so staging serves /agentic-cms/.
let browser, bundle;
before(async () => {
  const fixture = path.join(__dirname, 'agentic-feature-browser');
  bundle = await buildBundle({ outputName: 'agentic-page-path-browser', entry: path.join(fixture, 'gated-page-entry.tsx'), aliases: {
    './AuthContext$': path.join(fixture, 'context-auth.tsx'),
    '@/components/AuthContext$': path.join(fixture, 'context-auth.tsx'),
    '@/lib/api$': path.join(fixture, 'context-api.ts'),
    '@/lib/permissions$': path.join(fixture, 'context-permissions.ts'),
    '@/features/agentic-cms$': path.join(__dirname, '../features/agentic-cms/index.tsx'),
  }});
  browser = await chromium.launch({ headless: true, ...(process.env.NAVIGATION_BROWSER_CHANNEL ? { channel: process.env.NAVIGATION_BROWSER_CHANNEL } : {}) });
});
after(() => browser?.close());

const open = async (t, url) => {
  const context = await browser.newContext(); t.after(() => context.close());
  await context.route('**/*', route => {
    const js = route.request().url().endsWith('/bundle.js');
    return route.fulfill({ contentType: js ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', body: js ? bundle : document });
  });
  const page = await context.newPage();
  await page.goto(`http://gate.test${url}`);
  return page;
};

for (const pagePath of ['/agentic-cms', '/agentic-cms/']) {
  test(`with the feature enabled, ${pagePath} opens the AI Review tab and its queue`, async t => {
    const page = await open(t, `${pagePath}?role=PM&reviewDemo=1&tab=review`);
    await page.getByRole('heading', { name: 'Agentic CMS' }).waitFor();
    assert.equal(await page.getByRole('tab').count(), 3);
    assert.equal(await page.getByRole('tab', { name: 'AI Review' }).getAttribute('aria-selected'), 'true');
    await page.getByRole('heading', { name: 'AI review' }).waitFor();
    await page.getByRole('list', { name: 'Submissions' }).getByRole('listitem').first().waitFor();
    await page.getByRole('button', { name: 'Request AI review' }).or(page.getByRole('region', { name: 'Review status' })).first().waitFor();
    assert.equal(new URL(page.url()).pathname, pagePath, 'the page does not redirect');
  });

  test(`with the feature off, ${pagePath} explains that the account is not enabled`, async t => {
    const page = await open(t, `${pagePath}?role=PM&reviewDemo=1&tab=review&flagOff`);
    await page.getByText('Agentic CMS loads when this account is enabled for the feature.').waitFor();
    assert.equal(await page.getByRole('tab').count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'AI review' }).count(), 0);
  });
}

for (const otherPath of ['/agentic-cms-preview/', '/overview/']) {
  test(`${otherPath} does not render the Agentic CMS page`, async t => {
    const page = await open(t, `${otherPath}?role=PM&reviewDemo=1&tab=review`);
    // OTCR Bot mounts on every page once the feature is enabled; the page itself must not.
    await page.getByRole('button', { name: 'OTCR Bot' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Agentic CMS' }).count(), 0);
    assert.equal(await page.getByRole('tab').count(), 0);
  });
}
