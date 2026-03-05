'use client';

import { useEffect, useState } from 'react';
import { Slack, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getEffectiveRole } from '@/lib/permissions';
import { authAPI, onboardingAPI, setAuthToken, slackAPI } from '@/lib/api';
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
  const [onboardingRequests, setOnboardingRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isExecutive = role === 'EXECUTIVE';
  const canReviewOnboarding = role === 'ADMIN' || role === 'PARTNER' || role === 'EXECUTIVE';

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

  useEffect(() => {
    const loadRequests = async () => {
      if (!session.isLoggedIn || !canReviewOnboarding) {
        setOnboardingRequests([]);
        return;
      }

      setLoadingRequests(true);
      try {
        const res = await onboardingAPI.listRequests();
        setOnboardingRequests(Array.isArray(res.data?.requests) ? res.data.requests : []);
      } catch (e: any) {
        setError(parseApiError(e, 'Failed to load onboarding requests'));
      } finally {
        setLoadingRequests(false);
      }
    };

    void loadRequests();
  }, [session.isLoggedIn, canReviewOnboarding]);

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

  const handleReviewRequest = async (requestId: string, action: 'approve' | 'reject') => {
    setReviewingRequestId(requestId);
    setError(null);
    setMessage(null);
    try {
      if (action === 'approve') {
        await onboardingAPI.approveRequest(requestId);
      } else {
        await onboardingAPI.rejectRequest(requestId);
      }

      const res = await onboardingAPI.listRequests();
      setOnboardingRequests(Array.isArray(res.data?.requests) ? res.data.requests : []);
      setMessage(action === 'approve' ? 'Access request approved.' : 'Access request rejected.');
    } catch (e: any) {
      setError(parseApiError(e, `Failed to ${action} access request`));
    } finally {
      setReviewingRequestId(null);
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

        {canReviewOnboarding && (
          <Card>
            <CardHeader>
              <CardTitle>Role Onboarding Requests</CardTitle>
              <CardDescription>Approve or reject submitted access requests.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingRequests ? (
                <p className="text-sm text-[var(--foreground)]/60">Loading requests...</p>
              ) : onboardingRequests.length === 0 ? (
                <p className="text-sm text-[var(--foreground)]/60">No onboarding requests yet.</p>
              ) : (
                onboardingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 p-4 flex flex-col gap-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{request.name}</p>
                        <p className="text-sm text-[var(--foreground)]/70">{request.email}</p>
                        <p className="text-xs text-[var(--foreground)]/60 mt-1">
                          Requested role: {String(request.requestedRole).replace(/_/g, ' ')}
                        </p>
                      </div>
                      <span className="rounded-full bg-[var(--card)] px-3 py-1 text-xs font-semibold">
                        {request.status}
                      </span>
                    </div>

                    {request.status === 'PENDING' ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => void handleReviewRequest(request.id, 'approve')}
                          loading={reviewingRequestId === request.id}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleReviewRequest(request.id, 'reject')}
                          disabled={reviewingRequestId === request.id}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--foreground)]/60">
                        Reviewed {request.reviewedAt ? new Date(request.reviewedAt).toLocaleString() : 'previously'}
                      </p>
                    )}
                  </div>
                ))
              )}
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
