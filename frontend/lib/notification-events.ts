'use client';

const REFRESH_EVENT_NAME = 'otcr:notifications:refresh';

export function dispatchNotificationsRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT_NAME));
}

export function getNotificationsRefreshEventName(): string {
  return REFRESH_EVENT_NAME;
}
