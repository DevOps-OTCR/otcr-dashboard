'use client';

import { useEffect, useState } from 'react';
import { Slack, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getEffectiveRole } from '@/lib/permissions';
import { authAPI, setAuthToken, slackAPI } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import type { AppRole } from '@/lib/permissions';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { AppNavbar } from '@/components/AppNavbar';

function parseApiError(err: any, fallback: string): string {
  const message = err?.response?.data?.message ?? err?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

export default function SlackSettingsPage() {
  const session = useAuth();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [isConnectingSlack, setIsConnectingSlack] = useState(false);
  const [isGrantingAccess, setIsGrantingAccess] = useState(false);
  const [dashboardAccessEmail, setDashboardAccessEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isExecutive = role === 'EXECUTIVE';

  useEffect(() => {
    const syncRole = async () => {
      if (!session.isLoggedIn) {
        setAuthToken(null);
        return;
      }

      const token = await session.getToken();
      const email = session.user?.email || '';
      setAuthToken(token);
      const resolvedRole = await getEffectiveRole(token, email);
      setRole(resolvedRole);
    };
    void syncRole();
  }, [session]);

  const handleConnectSlack = async () => {
    setIsConnectingSlack(true);
    setError(null);
    setMessage(null);

    try {
      const res = await slackAPI.getInstallUrl({ purpose: 'CONNECT' });
      const installUrl = res.data?.installUrl as string | undefined;
      if (!installUrl) throw new Error('Backend did not return a Slack connect URL');

      const popup = window.open(
        installUrl,
        'otcr_slack_oauth',
        'width=620,height=780,menubar=no,toolbar=no,status=no',
      );

      if (!popup) {
        throw new Error('Popup blocked. Allow popups and try again.');
      }

      setMessage('Slack connect opened in a new window. Complete the flow and close it.');
    } catch (e: any) {
      setError(parseApiError(e, 'Could not start Slack connect flow'));
    } finally {
      setIsConnectingSlack(false);
    }
  };

  const handleGrantDashboardAccess = async () => {
    const normalizedEmail = dashboardAccessEmail.trim().toLowerCase();
    if (!normalizedEmail) return;

    setIsGrantingAccess(true);
    setError(null);
    setMessage(null);
    try {
      await authAPI.addAllowedEmail({ email: normalizedEmail, role: 'CONSULTANT' });
      setDashboardAccessEmail('');
      setMessage(`Dashboard access granted to ${normalizedEmail}.`);
    } catch (e: any) {
      setError(parseApiError(e, 'Failed to grant dashboard access'));
    } finally {
      setIsGrantingAccess(false);
    }
  };

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppNavbar role={role} currentPath="/settings/slack" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Slack className="w-5 h-5 text-[var(--primary)]" />
              Slack
            </CardTitle>
            <CardDescription>Connect your Slack account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleConnectSlack}
              loading={isConnectingSlack}
              icon={!isConnectingSlack ? <Slack className="w-4 h-4" /> : undefined}
            >
              Connect Slack
            </Button>
          </CardContent>
        </Card>

        {isExecutive && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[var(--primary)]" />
                Grant Dashboard Access
              </CardTitle>
              <CardDescription>Add an email that can access the dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={dashboardAccessEmail}
                  onChange={(e) => setDashboardAccessEmail(e.target.value)}
                  placeholder="member@illinois.edu"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 text-sm"
                />
                <Button
                  onClick={handleGrantDashboardAccess}
                  loading={isGrantingAccess}
                  disabled={!dashboardAccessEmail.trim()}
                >
                  Grant Access
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {message && (
          <p className="text-sm rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="text-sm rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-red-700">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
