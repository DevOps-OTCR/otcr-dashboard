'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import { AppNavbar } from '@/components/AppNavbar';
import { PageLoading } from '@/components/PageLoading';
import { Button } from '@/components/ui/Button';
import { PeopleDirectory } from '@/components/people/PeopleDirectory';
import { OnboardingQueue } from '@/components/people/OnboardingQueue';
import { SlackRoleSuggestions } from '@/components/people/SlackRoleSuggestions';
import { apiError, personName, safePersonName, type Person, type OnboardingRequest } from '@/components/people/types';
import { authAPI, onboardingAPI, peopleAPI, setAuthToken, slackRoleSuggestionsAPI } from '@/lib/api';
import { clearRoleCache, isValidAppRole, ROLE_FULL_LABELS, type AppRole } from '@/lib/permissions';
import { canReviewSlackRoleSuggestions, type SlackRoleSuggestion, type SlackRoleSuggestionList } from '@/lib/slack-role-suggestions';

export default function PeoplePage() {
  const { loading: authLoading, isLoggedIn, getToken, user } = useAuth();
  const email = user?.email;
  const router = useRouter();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [people, setPeople] = useState<Person[]>([]);
  const [requests, setRequests] = useState<OnboardingRequest[]>([]);
  const [slackSuggestions, setSlackSuggestions] = useState<SlackRoleSuggestionList | null>(null);
  const [slackSuggestionsError, setSlackSuggestionsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!isCurrent() || !isLoggedIn || !email) return;
    setBusy(true);
    try {
      const token = await getToken();
      if (!isCurrent()) return;
      setError(null);
      setAuthToken(token || email);
      // Fresh server role: never use the development role override to authorize People.
      const response = await authAPI.getRole();
      if (!isCurrent()) return;
      const currentRole = response.data?.role;
      if (!isValidAppRole(currentRole)) throw new Error('Unable to verify your role');
      setRole(currentRole);
      setDenied(currentRole !== 'ADMIN');
      setSlackSuggestionsError(null);
      if (currentRole !== 'ADMIN') { setPeople([]); setRequests([]); setSlackSuggestions(null); return; }
      const [directory, queue] = await Promise.all([peopleAPI.list(), onboardingAPI.listRequests()]);
      if (!isCurrent()) return;
      setPeople(directory.data.people);
      setRequests(queue.data.requests);
      // Suggestions are fetched separately so a failure never breaks People.
      try {
        const suggestions = await slackRoleSuggestionsAPI.list();
        if (!isCurrent()) return;
        setSlackSuggestions(suggestions.data);
        setSlackSuggestionsError(null);
      } catch (error) {
        if (!isCurrent()) return;
        setSlackSuggestions(null);
        setSlackSuggestionsError(apiError(error, 'Could not load Slack role suggestions.'));
      }
    } catch (error) {
      if (!isCurrent()) return;
      setPeople([]);
      setRequests([]);
      setSlackSuggestions(null);
      setSlackSuggestionsError(null);
      setError(apiError(error, 'Failed to load People'));
    } finally {
      if (isCurrent()) { setLoading(false); setBusy(false); }
    }
  }, [isLoggedIn, email, getToken]);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) router.replace('/sign-in');
  }, [authLoading, isLoggedIn, router]);
  useEffect(() => {
    let current = true;
    // Defer until after mount so Strict Mode cleanup can cancel the first load.
    void Promise.resolve().then(() => {
      if (!current) return;
      setLoading(true);
      return load(() => current);
    });
    return () => { current = false; };
  }, [load]);

  async function changeRole(person: Person, nextRole: AppRole) {
    if (!window.confirm(`Change ${safePersonName(person)} (${person.email}) from ${ROLE_FULL_LABELS[person.role]} to ${ROLE_FULL_LABELS[nextRole]}?`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Unable to refresh your session. Sign in again.');
      setAuthToken(token);
      await peopleAPI.changeRole(person.id, nextRole);
      setPeople(current => current.map(item => item.id === person.id ? { ...item, role: nextRole } : item));
      clearRoleCache(person.email);
      setMessage(`Role updated for ${safePersonName(person)}.`);
      if (person.email.toLowerCase() === email?.toLowerCase()) await load();
    } catch (error) { setError(apiError(error, 'Failed to change role')); }
    finally { setBusy(false); }
  }

  async function review(request: OnboardingRequest, action: 'approve' | 'reject', grantedRole: AppRole, notes: string) {
    const confirmation = action === 'approve'
      ? `Approve ${request.name} (${request.email}) as ${ROLE_FULL_LABELS[grantedRole]}? Requested: ${ROLE_FULL_LABELS[request.requestedRole]}.`
      : `Reject the onboarding request from ${request.name} (${request.email})?`;
    if (!window.confirm(confirmation)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Unable to refresh your session. Sign in again.');
      setAuthToken(token);
      if (action === 'approve') await onboardingAPI.approveRequest(request.id, notes, grantedRole);
      else await onboardingAPI.rejectRequest(request.id, notes);
      setMessage(action === 'approve' ? 'Onboarding request approved.' : 'Onboarding request rejected.');
      await load();
    } catch (error) { setError(apiError(error, 'Failed to review request')); }
    finally { setBusy(false); }
  }

  async function reviewSuggestion(suggestion: SlackRoleSuggestion, action: 'approve' | 'dismiss') {
    const confirmation = action === 'approve'
      ? `Approve ${personName(suggestion.user)} (${suggestion.user.email}) as ${ROLE_FULL_LABELS[suggestion.suggestedRole]}? Current: ${ROLE_FULL_LABELS[suggestion.user.role]}.`
      : `Dismiss the Slack role suggestion for ${personName(suggestion.user)} (${suggestion.user.email})?`;
    if (!window.confirm(confirmation)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Unable to refresh your session. Sign in again.');
      setAuthToken(token);
      if (action === 'approve') {
        await slackRoleSuggestionsAPI.approve(suggestion.id);
        clearRoleCache(suggestion.user.email);
        setMessage(`Role updated for ${personName(suggestion.user)}.`);
      } else {
        await slackRoleSuggestionsAPI.dismiss(suggestion.id);
        setMessage('Slack role suggestion dismissed.');
      }
      await load();
    } catch (error) { setError(apiError(error, 'Failed to review Slack role suggestion')); }
    finally { setBusy(false); }
  }

  async function syncSuggestions() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Unable to refresh your session. Sign in again.');
      setAuthToken(token);
      const response = await slackRoleSuggestionsAPI.sync();
      const data = response.data as { status?: string; message?: string; created?: number; updated?: number; retired?: number; failed?: number };
      const failed = data?.failed ?? 0;
      if (data?.status === 'not_connected') setMessage(data.message ?? 'Slack is not connected for this workspace.');
      else setMessage(`Slack sync complete: ${data?.created ?? 0} created, ${data?.updated ?? 0} updated, ${data?.retired ?? 0} retired.${failed > 0 ? ` ${failed} could not be read from Slack.` : ''}`);
      await load();
    } catch (error) { setError(apiError(error, 'Failed to sync Slack role suggestions')); }
    finally { setBusy(false); }
  }

  if (authLoading || !isLoggedIn) return <PageLoading />;
  return <>
    <AppNavbar role={role} currentPath="/people" />
    <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">People</h1><p className="text-sm text-[var(--text-muted)]">Manage CMS users and onboarding requests.</p></div>
        <Button variant="outline" disabled={busy || loading} onClick={() => void load()}>Refresh</Button></div>
      {error && <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-3">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3">{message}</p>}
      {loading ? <PageLoading /> : denied ? <p role="alert">Only administrators can access People.</p> : role === 'ADMIN' && <>
        <PeopleDirectory people={people} busy={busy} onChangeRole={changeRole} />
        <OnboardingQueue requests={requests} busy={busy} onReview={review} />
        {canReviewSlackRoleSuggestions(role) && <SlackRoleSuggestions data={slackSuggestions} busy={busy} loadError={slackSuggestionsError} onSync={syncSuggestions} onReview={reviewSuggestion} />}
      </>}
    </main>
  </>;
}
