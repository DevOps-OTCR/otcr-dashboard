const test = require('node:test');
const assert = require('node:assert/strict');

const { waitForSignIn } = require('./check-staging.cjs');

test('matches /sign-in and /sign-in/', async () => {
  for (const url of ['https://example.test/sign-in', 'https://example.test/sign-in/']) {
    let awaited = null;
    const fakePage = {
      waitForURL(pattern) {
        awaited = pattern;
        return Promise.resolve();
      },
    };
    await waitForSignIn(fakePage);
    assert.ok(awaited instanceof RegExp);
    assert.ok(awaited.test(url), `expected ${awaited} to match ${url}`);
  }
});

test('does not match /sign-in/extra', () => {
  const pattern = getPattern();
  assert.equal(pattern.test('https://example.test/sign-in/extra'), false);
});

test('does not match /projects', () => {
  const pattern = getPattern();
  assert.equal(pattern.test('https://example.test/projects'), false);
});

function getPattern() {
  let awaited = null;
  const fakePage = {
    waitForURL(pattern) {
      awaited = pattern;
      return Promise.resolve();
    },
  };
  // Synchronous capture; waitForSignIn returns a promise but the pattern is
  // captured before any await, so reading it immediately is safe.
  waitForSignIn(fakePage);
  assert.ok(awaited instanceof RegExp);
  return awaited;
}
