'use client';

import { AppNavbar } from '@/components/AppNavbar';

export type LCPartnerNavPath =
  | '/lc'
  | '/partner'
  | '/engagement'
  | '/teams'
  | '/slides'
  | '/workstream-docs'
  | '/client-notes';

export type LCPartnerRole = 'LC' | 'PARTNER';

interface LCPartnerNavbarProps {
  role: LCPartnerRole;
  currentPath: LCPartnerNavPath;
  unreadNotificationCount?: number;
  onNavClick?: (key: string) => void;
}

export function LCPartnerNavbar({
  role,
  currentPath,
  unreadNotificationCount = 0,
}: LCPartnerNavbarProps) {
  return <AppNavbar role={role} currentPath={currentPath} unreadNotificationCount={unreadNotificationCount} />;
}
