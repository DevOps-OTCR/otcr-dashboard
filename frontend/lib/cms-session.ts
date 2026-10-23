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

export async function withAuthTimeout<T>(operation: Promise<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Authentication timed out. Please retry.')), milliseconds);
    })]);
  } finally { clearTimeout(timer!); }
}
