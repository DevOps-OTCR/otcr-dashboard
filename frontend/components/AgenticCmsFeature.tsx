'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { api } from '@/lib/api';

// The feature module is not loaded or mounted until the backend permits it.
const AgenticCms = lazy(() => import('@/features/agentic-cms'));

function AgenticCmsSession({ getToken }: { getToken: () => Promise<string | null> }) {
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = async () => {
      const attempt = ++revision;
      try {
        const token = await getToken();
        if (!token) throw new Error('Sign-in required');
        const { data } = await api.get('/feature-flags', {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10_000,
        });
        if (active && attempt === revision) { setEnabled(data?.agenticCms === true); setChecked(true); }
      } catch {
        // Old backends, failed requests and expired sessions all keep the UI off.
        if (active && attempt === revision) { setEnabled(false); setChecked(true); }
      }
    };
    const onFocus = () => { void refresh(); };
    void refresh();
    const interval = window.setInterval(onFocus, 30_000);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [getToken]);

  if (!enabled) {
    const mount = pathname === '/agentic-cms' && document.getElementById('agentic-cms-root');
    return checked && mount ? createPortal(<p className="m-6">Agentic CMS loads when this account is enabled for the feature.</p>, mount) : null;
  }
  return <Suspense fallback={null}><AgenticCms /></Suspense>;
}

export function AgenticCmsFeature() {
  const { isLoggedIn, user, getToken } = useAuth();
  const email = user?.email?.trim().toLowerCase() ?? '';
  // Unmounting on sign-out and keying by account prevent stale grants flashing.
  return isLoggedIn && email ? <AgenticCmsSession key={email} getToken={getToken} /> : null;
}
