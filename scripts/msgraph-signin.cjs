#!/usr/bin/env node
/**
 * One-time Microsoft Graph sign-in (device code flow).
 * Prints a MSGRAPH_REFRESH_TOKEN to paste into backend/.env.
 *
 * Usage:
 *   node scripts/msgraph-signin.cjs
 *
 * Requires MSGRAPH_CLIENT_ID and MSGRAPH_TENANT_ID in backend/.env (or env vars).
 * The app registration needs:
 *   - Delegated permissions: Files.ReadWrite, offline_access
 *   - Mobile/desktop redirect URI: https://login.microsoftonline.com/common/oauth2/nativeclient
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

// Load backend/.env — handles quoted values, inline comments, \r\n, and blank/comment lines.
const envPath = path.join(__dirname, '..', 'backend', '.env');
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1);
    // Strip inline comment (space + #) only outside quotes
    val = val.replace(/\s+#.*$/, '');
    val = val.trim();
    // Strip surrounding single or double quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
} else {
  console.error(`No .env found at ${envPath} — set MSGRAPH_CLIENT_ID and MSGRAPH_TENANT_ID as env vars or create the file.`);
}

const clientId = process.env.MSGRAPH_CLIENT_ID;
const tenantId = process.env.MSGRAPH_TENANT_ID;

if (!clientId || !tenantId) {
  console.error('Set MSGRAPH_CLIENT_ID and MSGRAPH_TENANT_ID in backend/.env first.');
  process.exit(1);
}

const SCOPE = 'https://graph.microsoft.com/Files.ReadWrite offline_access';

async function post(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Requesting device code…\n');
  const { status, body } = await post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
    { client_id: clientId, scope: SCOPE },
  );

  if (status !== 200) {
    console.error('Device code request failed:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log(body.message);
  console.log();

  const interval = (body.interval ?? 5) * 1000;
  const expires = Date.now() + (body.expires_in ?? 900) * 1000;

  while (Date.now() < expires) {
    await sleep(interval);
    const { status: s, body: t } = await post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: body.device_code,
      },
    );

    if (s === 200 && t.refresh_token) {
      console.log('\n✓ Signed in. Add this line to backend/.env:\n');
      console.log(`MSGRAPH_REFRESH_TOKEN=${t.refresh_token}`);
      console.log('\nThe token is valid for ~90 days. Re-run this script when it expires.');
      return;
    }

    if (t.error === 'authorization_pending') continue;
    if (t.error === 'authorization_declined') { console.error('Sign-in was declined.'); process.exit(1); }
    if (t.error === 'expired_token') { console.error('Device code expired — run the script again.'); process.exit(1); }

    console.error('Unexpected response:', JSON.stringify(t, null, 2));
    process.exit(1);
  }

  console.error('Timed out waiting for sign-in.');
  process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
