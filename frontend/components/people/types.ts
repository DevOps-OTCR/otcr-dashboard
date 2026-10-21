import type { AppRole } from '@/lib/permissions';

export const CMS_ROLES: AppRole[] = ['CONSULTANT', 'LC', 'PM', 'PARTNER', 'EXECUTIVE', 'ADMIN'];
export type Person = {
  id: string; email: string; firstName: string | null; lastName: string | null;
  active: boolean; role: AppRole;
  teams: Array<{ id: string; name: string; manages: boolean }>;
};
export type OnboardingRequest = {
  id: string; name: string; email: string; requestedRole: AppRole; grantedRole: AppRole | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string; reviewedAt: string | null;
  reviewerNotes: string | null;
  reviewer?: { email: string; firstName: string | null; lastName: string | null } | null;
};
export const personName = (person: Pick<Person, 'firstName' | 'lastName' | 'email'>) =>
  [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email;
export function safePersonName(person: Person): string {
  const name = personName(person);
  // If name is just an email-like value (starts with something@), show the email instead
  if (name.includes('@')) return person.email;
  // If name is suspiciously long (likely an encoded JWT), truncate with tooltip
  if (name.length > 40) return `${name.slice(0, 37)}...`;
  return name;
}
export function apiError(error: unknown, fallback: string) {
  const value = error as { response?: { data?: { message?: string | string[] } }; message?: string };
  const message = value?.response?.data?.message ?? value?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}
