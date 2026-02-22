'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link2, RefreshCw, Slack } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getEffectiveRole } from '@/lib/permissions';
import { setAuthToken, slackAPI, type SlackOAuthPurpose } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import type { AppRole } from '@/lib/permissions';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { AppNavbar } from '@/components/AppNavbar';

type SlackConnection = {
  id: string;
  slackUserId: string;
  updatedAt: string;
  workspace: {
    teamId: string;
    teamName: string | null;
    enterpriseId: string | null;
    installedAt: string;
  };
};

const INSTALL_ALLOWED_ROLES = new Set(['ADMIN', 'PM', 'PARTNER']);

export default function SlackSettingsPage() {
  const session = useAuth();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [connections, setConnections] = useState<SlackConnection[]>([]);
  const [workspaceTeamId, setWorkspaceTeamId] = useState('');
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [isOpeningInstall, setIsOpeningInstall] = useState(false);
  const [isOpeningConnect, setIsOpeningConnect] = useState(false);
  const [isConnectingByEmail, setIsConnectingByEmail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canInstallWorkspace = INSTALL_ALLOWED_ROLES.has(role);

  const activeWorkspaceCount = useMemo(() => {
    const unique = new Set(connections.map((c) => c.workspace.teamId));
    return unique.size;
  }, [connections]);

  const loadConnections = async () => {
    setIsLoadingConnections(true);
    setError(null);
    try {
      const res = await slackAPI.getConnections();
      const data = Array.isArray(res.data?.connections) ? res.data.connections : [];
      setConnections(data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load Slack connections');
    } finally {
      setIsLoadingConnections(false);
    }
  };

  const openOAuthPopup = async (purpose: SlackOAuthPurpose) => {
    const setLoading = purpose === 'INSTALL' ? setIsOpeningInstall : setIsOpeningConnect;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await slackAPI.getInstallUrl({
        purpose,
        ...(workspaceTeamId.trim() ? { workspaceId: workspaceTeamId.trim() } : {}),
      });
      const installUrl = res.data?.installUrl as string | undefined;

      if (!installUrl) {
        throw new Error('Backend did not return a Slack install URL');
      }

      const popup = window.open(
        installUrl,
        'otcr_slack_oauth',
        'width=620,height=780,menubar=no,toolbar=no,status=no',
      );

      if (!popup) {
        throw new Error('Popup blocked. Allow popups and try again.');
      }

      setMessage('Slack OAuth opened in a new window. Complete install/connect, then close it.');

      const timer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(timer);
          void loadConnections();
        }
      }, 1000);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not start Slack OAuth flow');
    } finally {
      setLoading(false);
    }
  };

  const connectByEmail = async () => {
    setIsConnectingByEmail(true);
    setError(null);
    setMessage(null);
    try {
      await slackAPI.connectByEmail(workspaceTeamId.trim() || undefined);
      setMessage('Slack user mapped by email successfully.');
      await loadConnections();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not map Slack user by email');
    } finally {
      setIsConnectingByEmail(false);
    }
  };

  useEffect(() => {
    const sync = async () => {
      if (!session.isLoggedIn) {
        setAuthToken(null);
        return;
      }
      const token = await session.getToken();
      const email = session.user?.email || '';
      setAuthToken(token);
      const resolvedRole = await getEffectiveRole(token, email);
      setRole(resolvedRole);
      void loadConnections();
    };
    void sync();
  }, [session]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppNavbar role={role} currentPath="/settings/slack" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--foreground)]/60">Integrations</p>
            <h1 className="text-2xl font-semibold mt-1">Slack Connection</h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Slack className="w-5 h-5 text-[var(--primary)]" />
              Workspace & User Setup
            </CardTitle>
            <CardDescription>
              Install the OTCR Slack app into a workspace, then connect your account to receive deadline DMs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4">
                <p className="text-xs text-[var(--foreground)]/60">Role</p>
                <p className="text-sm font-semibold mt-1">{role}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4">
                <p className="text-xs text-[var(--foreground)]/60">Connected Workspaces</p>
                <p className="text-sm font-semibold mt-1">{activeWorkspaceCount}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4">
                <p className="text-xs text-[var(--foreground)]/60">Slack Links</p>
                <p className="text-sm font-semibold mt-1">{connections.length}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-sm font-medium">Workspace Team ID (optional)</span>
                <input
                  value={workspaceTeamId}
                  onChange={(e) => setWorkspaceTeamId(e.target.value)}
                  placeholder="T0123456789"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => openOAuthPopup('INSTALL')}
                  loading={isOpeningInstall}
                  disabled={!canInstallWorkspace}
                  icon={!isOpeningInstall ? <Slack className="w-4 h-4" /> : undefined}
                >
                  Install Workspace App
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openOAuthPopup('CONNECT')}
                  loading={isOpeningConnect}
                  icon={!isOpeningConnect ? <Link2 className="w-4 h-4" /> : undefined}
                >
                  Connect My Slack
                </Button>
                <Button
                  variant="secondary"
                  onClick={connectByEmail}
                  loading={isConnectingByEmail}
                >
                  Connect By Email
                </Button>
                <Button
                  variant="ghost"
                  onClick={loadConnections}
                  loading={isLoadingConnections}
                  icon={!isLoadingConnections ? <RefreshCw className="w-4 h-4" /> : undefined}
                >
                  Refresh
                </Button>
              </div>

              {!canInstallWorkspace && (
                <p className="text-xs text-[var(--foreground)]/70">
                  Only PM, Partner, or Admin can run workspace installation.
                </p>
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Connections</CardTitle>
            <CardDescription>Slack user mappings currently linked to this dashboard account.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {connections.length === 0 && (
                <p className="text-sm text-[var(--foreground)]/70">No Slack connections found yet.</p>
              )}

              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {connection.workspace.teamName || 'Unnamed Workspace'}
                    </p>
                    <Badge variant="info" size="sm">Connected</Badge>
                  </div>
                  <p className="text-xs mt-1 text-[var(--foreground)]/70">team_id: {connection.workspace.teamId}</p>
                  <p className="text-xs mt-1 text-[var(--foreground)]/70">slack_user_id: {connection.slackUserId}</p>
                  <p className="text-xs mt-1 text-[var(--foreground)]/60">
                    Updated: {new Date(connection.updatedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
