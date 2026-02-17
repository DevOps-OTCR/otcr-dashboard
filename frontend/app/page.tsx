"use client"

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { useAuth } from '@/components/AuthContext';

export default function HomePage() {
  const { isLoggedIn, user } = useAuth();

  if (user && isLoggedIn) {
    redirect('/dashboard');
  } else {
    redirect('/sign-in');
  }
}
