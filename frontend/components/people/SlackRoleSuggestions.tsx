'use client';
import { Button } from '@/components/ui/Button';
import { ROLE_FULL_LABELS } from '@/lib/permissions';
import { personName } from './types';
import type { SlackRoleSuggestion, SlackRoleSuggestionList } from '@/lib/slack-role-suggestions';

export function SlackRoleSuggestions({ data, busy, onSync, onReview }: {
  data: SlackRoleSuggestionList | null; busy: boolean;
  onSync: () => Promise<void>;
  onReview: (suggestion: SlackRoleSuggestion, action: 'approve' | 'dismiss') => Promise<void>;
}) {
  const suggestions = data?.suggestions ?? [];
  return <section aria-labelledby="slack-suggestions-title" className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="slack-suggestions-title" className="text-lg font-semibold">Slack role suggestions</h2>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void onSync()}>Check Slack titles</Button>
    </div>
    {data?.status === 'not_connected'
      ? <p>{data.message ?? 'Slack is not connected for this workspace. Install the Slack app first.'}</p>
      : <>
        {!suggestions.length && <p>No pending Slack role suggestions.</p>}
        {suggestions.map(suggestion => <article key={suggestion.id} aria-label={`Suggestion for ${suggestion.user.email}`} className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/50 p-4 space-y-3">
          <div><h3 className="font-semibold">{personName(suggestion.user)}</h3><p className="text-sm break-all">{suggestion.user.email}</p></div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-[var(--text-muted)]">Current role</dt><dd>{ROLE_FULL_LABELS[suggestion.currentRole]}</dd></div>
            <div><dt className="text-[var(--text-muted)]">Suggested role</dt><dd>{ROLE_FULL_LABELS[suggestion.suggestedRole]}</dd></div>
            <div className="sm:col-span-2"><dt className="text-[var(--text-muted)]">Slack title</dt><dd className="whitespace-pre-wrap break-words">{suggestion.slackTitle}</dd></div>
            <div><dt className="text-[var(--text-muted)]">Created</dt><dd>{new Date(suggestion.createdAt).toLocaleString()}</dd></div>
          </dl>
          <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void onReview(suggestion, 'approve')}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void onReview(suggestion, 'dismiss')}>Dismiss</Button></div>
        </article>)}
      </>}
    <p className="text-sm text-[var(--text-muted)]">Suggestions are never applied automatically.</p>
  </section>;
}
