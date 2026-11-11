'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Keeps old /pm, /lc, and /partner bookmarks working. Client-side so it also works in the Pages static export. */
export function LegacyOverviewRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/overview'); }, [router]);
  return null;
}
