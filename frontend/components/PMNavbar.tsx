'use client';

import { AppNavbar } from '@/components/AppNavbar';

export type PMNavPath =
  | '/pm'
  | '/engagement'
  | '/teams'
  | '/slides'
  | '/workstream-docs'
  | '/client-notes';

interface PMNavbarProps {
  currentPath: PMNavPath;
  unreadNotificationCount?: number;
  onNavClick?: (key: string) => void;
}

export function PMNavbar({ currentPath, unreadNotificationCount = 0 }: PMNavbarProps) {
  return <AppNavbar role="PM" currentPath={currentPath} unreadNotificationCount={unreadNotificationCount} />;
}
