import type { AuthenticationResult } from '@azure/msal-browser';

// App-owned coordination only. Accounts and tokens remain managed by MSAL.
export const CMS_SESSION_KEY = 'otcr_cms_session';
const LOGIN_ATTEMPT_KEY = 'otcr_cms_login_attempt';
export type CmsSession = { revision: string; signedOut: boolean; accountId?: string };

export function readCmsSession(): CmsSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(CMS_SESSION_KEY) ?? 'null');
    return value && typeof value.revision === 'string' && typeof value.signedOut === 'boolean' ? value : null;
  } catch { return null; }
}

export function cmsSessionRevision() { return readCmsSession()?.revision ?? ''; }

function saveSession(signedOut: boolean, accountId?: string) {
  const session: CmsSession = { revision: crypto.randomUUID(), signedOut, accountId };
  localStorage.setItem(CMS_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function markCmsSignedOut() { return saveSession(true); }

export function beginCmsSignIn() {
  sessionStorage.setItem(LOGIN_ATTEMPT_KEY, cmsSessionRevision());
}

export function completeCmsSignIn(accountId: string): boolean {
  const startedAt = sessionStorage.getItem(LOGIN_ATTEMPT_KEY);
  sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
  // A sign-out in another tab invalidates an earlier in-flight redirect.
  if (startedAt !== null && startedAt !== cmsSessionRevision()) return false;
  if (startedAt === null && readCmsSession()?.signedOut) return false;
  saveSession(false, accountId);
  return true;
}

// MSAL v5's LOGIN_SUCCESS event carries only the account, so the tab that finishes
// sign-in shares its result with open tabs, itself included (same origin only).
const SIGN_IN_CHANNEL = 'otcr_cms_sign_in';

export function shareCmsSignIn(result: AuthenticationResult) {
  if (typeof BroadcastChannel === 'undefined') return;
  // Best effort: other tabs still recover on their own, and this sign-in must not fail.
  try {
    const channel = new BroadcastChannel(SIGN_IN_CHANNEL);
    channel.postMessage(result);
    channel.close();
  } catch { /* Other tabs fall back to their own session checks. */ }
}

export function onSharedCmsSignIn(listener: (result: AuthenticationResult) => void) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(SIGN_IN_CHANNEL);
  channel.onmessage = (event: MessageEvent<AuthenticationResult>) => listener(event.data);
  return () => channel.close();
}

export async function withAuthTimeout<T>(operation: Promise<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Authentication timed out. Please retry.')), milliseconds);
    })]);
  } finally { clearTimeout(timer!); }
}
