# Navigation regression tests

Run from `frontend`:

```powershell
npm ci
npm run test:roles
npm run test:navigation
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Browser tests need the `playwright` package and an installed Chrome browser. Install
Playwright separately without changing the application lockfile:

```powershell
npm install --no-save --package-lock=false playwright
npm run test:navigation:browser
```

If Playwright is provided by a local runtime, set `NODE_PATH` to that runtime's
`node_modules` directory instead of installing it. Set
`NAVIGATION_BROWSER_CHANNEL` to `msedge` to use Edge.

The fixture compiles the real Deliverables, Slides, Attendance, navbar, API client,
and auth provider with the webpack bundled in Next.js. It replaces Next navigation
and the MSAL connection with test adapters. The tests render that bundle in Chrome
and intercept all document and API requests, so they do not access a backend or
Microsoft account. This covers React state, loading, caching, request scope, token
operations, and retries. It does not cover real Microsoft sign-in or Next's route
prefetch behavior.

Generated bundles are written to the ignored `frontend/build/navigation-browser`
directory. To inspect the fixture locally, run:

```powershell
node tests/navigation-browser/server.cjs
```

Open the printed URL with `/deliverables`, `/slides`, or `/attendance` appended.
