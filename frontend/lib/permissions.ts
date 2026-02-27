/**
 * Role-based permissions per feature matrix:
 * R = Read | W = Write | C = Comment | A = Approve | — = No access
 */

import { api } from "./api";

export type AppRole = 'CONSULTANT' | 'LC' | 'PM' | 'PARTNER' | 'EXECUTIVE' | 'ADMIN';

const ROLES: AppRole[] = ['CONSULTANT', 'LC', 'PM', 'PARTNER', 'EXECUTIVE', 'ADMIN'];
const DEV_ROLE_OVERRIDE_KEY = 'otcr_dev_role_override';
const ROLE_CACHE_PREFIX = 'otcr_role_cache:';
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;

type RoleCacheEntry = {
  role: AppRole;
  cachedAt: number;
};

export function isValidAppRole(r: string): r is AppRole {
  return ROLES.includes(r as AppRole);
}

/** Dev-only: override role to view any dashboard. Stored in localStorage. */
export function getDevRoleOverride(): AppRole | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(DEV_ROLE_OVERRIDE_KEY);
  return stored && isValidAppRole(stored) ? stored : null;
}

export function setDevRoleOverride(role: AppRole | null): void {
  if (typeof window === 'undefined') return;
  if (role) {
    localStorage.setItem(DEV_ROLE_OVERRIDE_KEY, role);
  } else {
    localStorage.removeItem(DEV_ROLE_OVERRIDE_KEY);
  }
}

function getRoleCacheKey(email: string): string {
  return `${ROLE_CACHE_PREFIX}${email.toLowerCase()}`;
}

function readCachedRole(email: string): AppRole | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getRoleCacheKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoleCacheEntry>;
    if (!parsed || typeof parsed.cachedAt !== 'number' || typeof parsed.role !== 'string') {
      localStorage.removeItem(getRoleCacheKey(email));
      return null;
    }
    if (!isValidAppRole(parsed.role)) {
      localStorage.removeItem(getRoleCacheKey(email));
      return null;
    }
    if (Date.now() - parsed.cachedAt > ROLE_CACHE_TTL_MS) {
      localStorage.removeItem(getRoleCacheKey(email));
      return null;
    }
    return parsed.role;
  } catch {
    localStorage.removeItem(getRoleCacheKey(email));
    return null;
  }
}

function writeCachedRole(email: string, role: AppRole): void {
  if (typeof window === 'undefined') return;
  try {
    const value: RoleCacheEntry = { role, cachedAt: Date.now() };
    localStorage.setItem(getRoleCacheKey(email), JSON.stringify(value));
  } catch {
    // Ignore localStorage quota/unavailable errors.
  }
}

export function clearRoleCache(email?: string | null): void {
  if (typeof window === 'undefined') return;
  if (email) {
    localStorage.removeItem(getRoleCacheKey(email));
    return;
  }
  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(ROLE_CACHE_PREFIX)) keysToDelete.push(key);
  }
  keysToDelete.forEach((key) => localStorage.removeItem(key));
}

/** Role from email only (no override). Use to show admin-only UI like role switcher. */
export function getActualUserRole(email: string | null | undefined): AppRole {
  if (!email) return 'CONSULTANT';
  const normalized = email.toLowerCase();
  const pmEmails = ['lsharma2@illinois.edu', 'crawat2@illinois.edu'];
  const adminEmails = ['admin@otcr.com', 'kona3@illinois.edu'];
  const partnerEmails: string[] = [];
  const lcEmails: string[] = [];
  if (adminEmails.includes(normalized)) return 'ADMIN';
  if (pmEmails.includes(normalized)) return 'PM';
  if (partnerEmails.includes(normalized)) return 'PARTNER';
  if (lcEmails.includes(normalized)) return 'LC';
  return 'CONSULTANT';
}

/** Resolve user role from email (used when session has no role from API). Uses dev override if set. */
export function getUserRole(email: string | null | undefined): AppRole {
  const override = getDevRoleOverride();
  if (override) return override;
  return getActualUserRole(email);
}

/**
 * Prefer role from session (from backend DB when set at login). Uses dev override first, then
 * session.user.role from API, then falls back to getActualUserRole(email).
 */
export async function getEffectiveRole(
  token: string | null,
  email: string | undefined,
): Promise<AppRole> {
  const override = getDevRoleOverride();
  if (override) return override;
  if (!token || !email) {
    throw new Error("Did not pass proper permission to getEffectiveRole");
  }
  const normalizedEmail = email.toLowerCase();
  const cachedRole = readCachedRole(normalizedEmail);
  if (cachedRole) return cachedRole;

  try {
    const response = await api.get("/auth/role");

    const roleString = response.data.role;

    if (typeof roleString === 'string' && isValidAppRole(roleString)) {
      writeCachedRole(normalizedEmail, roleString);
      return roleString;
    }
  } catch (error) {
    console.error("Failed to fetch role from API, falling back to email check", error);
  }

  const fallbackRole = getActualUserRole(normalizedEmail);
  writeCachedRole(normalizedEmail, fallbackRole);
  return fallbackRole;
}

/** Default dashboard path for a role (for redirects and admin switcher). */
export function getDefaultDashboardPath(role: AppRole): string {
  switch (role) {
    case 'PM':
    case 'ADMIN':
      return '/pm';
    case 'LC':
      return '/lc';
    case 'PARTNER':
    case 'EXECUTIVE':
      return '/partner';
    case 'CONSULTANT':
    default:
      return '/consultant';
  }
}

/** Full display name for each role (shown near logo). */
export const ROLE_FULL_LABELS: Record<AppRole, string> = {
  CONSULTANT: 'Consultant',
  LC: 'Lead Consultant',
  PM: 'Project Manager',
  PARTNER: 'Partner',
  EXECUTIVE: 'Executive',
  ADMIN: 'Administrator',
};

export const PERMISSIONS = {
  workstreamDocDraft: { consultant: false, lc: 'C', pm: 'RW+C', partner: 'R+C' },
  workstreamDocReleased: { consultant: 'R+C', lc: 'R+C', pm: 'RW+C', partner: 'R+C' },
  editWorkstreamLive: { consultant: false, lc: false, pm: true, partner: false },
  uploadInitialSlide: { consultant: 'W', lc: false, pm: false, partner: false },
  viewInitialSlides: { consultant: 'R', lc: 'R', pm: 'R', partner: 'R' },
  commentInitialSlides: { consultant: false, lc: 'C', pm: 'C', partner: 'C' },
  uploadFinalSlide: { consultant: 'W', lc: false, pm: false, partner: false },
  editFinalSlides: { consultant: false, lc: false, pm: 'W', partner: false },
  approveRequestRevision: { consultant: false, lc: 'A', pm: 'A', partner: false },
  viewFinalSlides: { consultant: 'R', lc: 'R', pm: 'R', partner: 'R' },
  commentFinalSlides: { consultant: false, lc: 'C', pm: 'C', partner: 'C' },
  compileDeck: { consultant: false, lc: false, pm: 'W', partner: false },
  downloadFinalDeck: { consultant: false, lc: false, pm: 'R', partner: 'R' },
  clientCallNotesWrite: { consultant: false, lc: 'W', pm: 'W', partner: false },
  clientCallNotesRead: { consultant: 'R', lc: 'R', pm: 'R', partner: 'R' },
  engagementStatusTimelines: { consultant: 'R', lc: 'R', pm: 'R', partner: 'R' },
} as const;

type RoleKey = keyof typeof PERMISSIONS.workstreamDocDraft;

function getAccess(role: AppRole): RoleKey {
  const map: Record<AppRole, RoleKey> = {
    CONSULTANT: 'consultant',
    LC: 'lc',
    PM: 'pm',
    PARTNER: 'partner',
    EXECUTIVE: 'partner',
    ADMIN: 'pm', // admin gets PM-level access
  };
  return map[role] ?? 'consultant';
}

export function hasAccess(
  permission: keyof typeof PERMISSIONS,
  role: AppRole,
  action: 'read' | 'write' | 'comment' | 'approve'
): boolean {
  const p = PERMISSIONS[permission];
  if (!p) return false;
  const access = p[getAccess(role)] as string | false | undefined;
  if (access === false || access === undefined || !access) return false;
  if (role === 'ADMIN') return true; // admin bypass
  const s = String(access);
  if (action === 'read') return s.includes('R');
  if (action === 'write') return s.includes('W');
  if (action === 'comment') return s.includes('C');
  if (action === 'approve') return s.includes('A');
  return false;
}

export function canShowNavItem(navId: string, role: AppRole): boolean {
  const map: Record<string, (r: AppRole) => boolean> = {
    overview: () => true,
    workstreamDocs: (r) => ['LC', 'PM', 'ADMIN'].includes(r) || hasAccess('workstreamDocReleased', r, 'read'),
    initialSlides: () => true,
    finalSlides: () => true,
    compileDeck: (r) => ['PM', 'ADMIN'].includes(r),
    downloadDeck: (r) => ['PM', 'PARTNER', 'EXECUTIVE', 'ADMIN'].includes(r),
    clientCallNotes: (r) => ['CONSULTANT', 'LC', 'PM', 'PARTNER', 'EXECUTIVE', 'ADMIN'].includes(r),
    team: (r) => ['CONSULTANT', 'LC', 'PM', 'PARTNER', 'EXECUTIVE', 'ADMIN'].includes(r),
  };
  return map[navId]?.(role) ?? false;
}
