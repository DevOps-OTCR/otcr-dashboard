"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import { getDefaultDashboardPathForUser } from '@/lib/permissions';

export default function HomePage() {
  const router = useRouter();
  const { isLoggedIn, user, loading, getToken } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!isLoggedIn || !user?.email) {
      router.replace('/sign-in');
      return;
    }

    const redirectToRoleDashboard = async () => {
      const token = await getToken();
      const target = await getDefaultDashboardPathForUser(token, user.email);
      router.replace(target);
    };

    void redirectToRoleDashboard();
  }, [getToken, isLoggedIn, loading, router, user?.email]);

  return null;
}
