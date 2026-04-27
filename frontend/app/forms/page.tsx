'use client';

import Link from 'next/link';
import { useEffect, useState, type ComponentType } from 'react';
import { ClipboardList, MessageSquare, ShieldAlert, TriangleAlert } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';
import { setAuthToken } from '@/lib/api';
import { cn } from '@/lib/utils';

type FormCard = {
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: ComponentType<{ className?: string }>;
};

const forms: FormCard[] = [
  {
    title: 'Dashboard Feedback Form',
    description: 'Submit product issues and improvement feedback for the dashboard.',
    href: '/feedback',
    cta: 'Open Form',
    icon: MessageSquare,
  },
  {
    title: 'Anonymous Feedback Form',
    description:
      'Please fill this out for any firmwide issues/tips, as well as project issues you may have!',
    href: '/feedback/anonymous',
    cta: 'Open Anonymous Form',
    icon: TriangleAlert,
  },
  {
    title: 'PRC Form',
    description:
      'This form is intended for reporting serious concerns only. If you experience or witness behavior at an OTCR event that makes you feel uncomfortable, please complete this form.',
    href: '/feedback/prc',
    cta: 'Open PRC Form',
    icon: ShieldAlert,
  },
];

export default function FormsPage() {
  const session = useAuth();
  const [role, setRole] = useState<AppRole>('CONSULTANT');

  useEffect(() => {
    const syncRole = async () => {
      if (!session.isLoggedIn) return;
      const token = await session.getToken();
      const email = session.user?.email || '';
      setAuthToken(token || email || null);
      const resolvedRole = await getEffectiveRole(token, email);
      setRole(resolvedRole);
    };
    void syncRole();
  }, [session]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppNavbar role={role} currentPath="/forms" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Card className="bg-[var(--card)]/95">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[var(--primary)]" />
                Forms
              </CardTitle>
              <CardDescription>
                Use the form that best matches the situation. Anonymous Feedback Form and PRC Form submissions are only visible to partners and administrators.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {forms.map((form) => {
            const Icon = form.icon;
            return (
              <Card key={form.href} className="h-full">
                <CardHeader>
                  <div className="space-y-3">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary)]/12">
                      <Icon className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                      <CardTitle>{form.title}</CardTitle>
                      <CardDescription className="mt-2">{form.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <Link
                    href={form.href}
                    className={cn(
                      'inline-flex w-full items-center justify-center rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/15 px-4 py-2 text-base font-medium text-[var(--primary)] transition-all duration-200 hover:bg-[var(--primary)]/25'
                    )}
                  >
                    {form.cta}
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
