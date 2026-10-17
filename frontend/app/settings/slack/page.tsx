'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

function resolveAuthHeaderValue(token: string | null, email?: string): string | null {
  return token || email || null;
}

type SlackConnection = {
  slackUserId: string;
  workspace?: {
    teamId?: string | null;
    teamName?: string | null;
    installedAt?: string | null;
  } | null;
};

export default function SlackSettingsPage() {
  const session = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [isConnectingSlack, setIsConnectingSlack] = useState(false);
  const [loadingSlackConnections, setLoadingSlackConnections] = useState(false);
  const [slackConnections, setSlackConnections] = useState<SlackConnection[]>([]);
  const [isGrantingAccess, setIsGrantingAccess] = useState(false);
  const [dashboardAccessEmail, setDashboardAccessEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canGrantDashboardAccess = role === 'ADMIN';
  const hasSlackConnection = slackConnections.length > 0;
  const latestSlackConnection = slackConnections[0] ?? null;

  const loadSlackConnections = async (options?: { silent?: boolean }) => {
    if (!session.isLoggedIn) {
      setSlackConnections([]);
      return [];
    }

    if (!options?.silent) {
      setLoadingSlackConnections(true);
    }

    try {
      const token = await session.getToken();
      setAuthToken(resolveAuthHeaderValue(token, session.user?.email));
      const res = await slackAPI.getConnections();
      const connections = Array.isArray(res.data?.connections) ? res.data.connections : [];
      setSlackConnections(connections);
      return connections as SlackConnection[];
    } catch (e: any) {
      if (!options?.silent) {
        setError(parseApiError(e, 'Failed to load Slack connection status'));
      }
      return [];
    } finally {
      if (!options?.silent) {
        setLoadingSlackConnections(false);
      }
    }
  };

  const finalizeSlackConnect = async () => {
    const existingConnections = await loadSlackConnections({ silent: true });
    if (existingConnections.length > 0) {
      setMessage('Slack connected successfully.');
      return;
    }

    try {
      const token = await session.getToken();
      setAuthToken(resolveAuthHeaderValue(token, session.user?.email));
      await slackAPI.connectByEmail();
      const refreshedConnections = await loadSlackConnections({ silent: true });
      if (refreshedConnections.length > 0) {
        setMessage('Slack connected successfully.');
        return;
      }
    } catch (e: any) {
      setError(parseApiError(e, 'Slack finished OAuth, but we could not link your OTCR account yet'));
      return;
    }

    setError('Slack finished OAuth, but your OTCR account is still not linked. Try connecting again.');
  };

  useEffect(() => {
    // Once auth init finishes, bounce signed-out users to sign-in instead of
    // leaving them stuck on the loader (deep links / bookmarks).
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in');
    }
  }, [session.loading, session.isLoggedIn, router]);

  useEffect(() => {
    const syncRole = async () => {
      if (!session.isLoggedIn) {
        setAuthToken(null);
        setRole('CONSULTANT');
        return;
      }

      try {
        const token = await session.getToken();
        const email = session.user?.email || '';
        setAuthToken(resolveAuthHeaderValue(token, email));
        const resolvedRole = await getEffectiveRole(token, email);
        setRole(resolvedRole);
      } catch {
        setRole('CONSULTANT');
      }
    };
    void syncRole();
  }, [session]);

  useEffect(() => {
    void loadSlackConnections();

    if (!session.isLoggedIn) return;

    const handleFocus = () => {
      void loadSlackConnections({ silent: true });
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [session.isLoggedIn, session.user?.email]);

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

      const pollForPopupClose = window.setInterval(() => {
        if (!popup.closed) return;

        window.clearInterval(pollForPopupClose);
        void finalizeSlackConnect();
      }, 800);
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
      setMessage('Dashboard access granted.');
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
            <CardDescription>
              {hasSlackConnection
                ? `Connected${latestSlackConnection?.workspace?.teamName ? ` to ${latestSlackConnection.workspace.teamName}` : ''}.`
                : 'Connect your Slack account.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingSlackConnections ? (
              <p className="text-sm text-[var(--foreground)]/60">Checking Slack connection...</p>
            ) : hasSlackConnection ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 p-3 text-sm">
                <p className="font-medium text-[var(--foreground)]">
                  Slack is connected
                  {latestSlackConnection?.workspace?.teamName ? ` to ${latestSlackConnection.workspace.teamName}` : ''}.
                </p>
                <p className="mt-1 text-[var(--foreground)]/60">
                  Alerts will be sent to your linked Slack account when notifications fire.
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--foreground)]/60">
                No Slack connection found yet.
              </p>
            )}
            <Button
              onClick={handleConnectSlack}
              loading={isConnectingSlack}
              icon={!isConnectingSlack ? <Slack className="w-4 h-4" /> : undefined}
            >
              {hasSlackConnection ? 'Reconnect Slack' : 'Connect Slack'}
            </Button>
          </CardContent>
        </Card>

        {canGrantDashboardAccess && (
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
          <p className="text-sm rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p className="text-sm rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
