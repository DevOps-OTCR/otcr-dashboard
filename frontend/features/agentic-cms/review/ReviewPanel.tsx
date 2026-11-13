'use client';

import { useEffect, useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { createMockReviewClient } from './mock-review-client';
import { buildQueue, countByFilter, filterRows, isActive, type QueueFilter } from './queue';
import { ReviewDetail } from './ReviewDetail';
import { ReviewQueueList } from './ReviewQueueList';
import type { ReviewClient, ReviewQueue } from './types';

const ACTIVE_POLL_MS = 1_000;
const IDLE_POLL_MS = 30_000;

/** Updates this tab's query parameters in place, keeping any others on the URL. */
function setReviewParams(submissionId: string | null) {
  const url = new URL(window.location.href);
  if (submissionId) {
    url.searchParams.set('tab', 'review');
    url.searchParams.set('submission', submissionId);
  } else {
    url.searchParams.delete('tab');
    url.searchParams.delete('submission');
  }
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
}

export function ReviewPanel({ projectId, projectName }: { projectId: string; projectName?: string }) {
  const { user } = useAuth();
  // One mock per mount: its state resets on reload, sign-out or flag-off unmount.
  const [client] = useState<ReviewClient>(() => createMockReviewClient({ viewerName: user?.name }));
  const [data, setData] = useState<ReviewQueue | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<QueueFilter>('ALL');
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('submission') ?? '');
  // Bumping this reloads immediately (Retry, and later after requesting a review).
  const [reloadKey, setReloadKey] = useState(0);

  // Poll quickly while a review is running, slowly otherwise so relative times stay fresh.
  // Each poll schedules the next, and a project change or unmount drops late results.
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const poll = () => {
      client.list(projectId).then(
        (next) => {
          if (!active) return;
          setData(next);
          setError('');
          setNow(Date.now());
          timer = window.setTimeout(poll, next.reviews.some((review) => isActive(review.status)) ? ACTIVE_POLL_MS : IDLE_POLL_MS);
        },
        () => {
          if (!active) return;
          setError('Could not load AI reviews. Try again.');
          timer = window.setTimeout(poll, IDLE_POLL_MS);
        },
      );
    };
    poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, projectId, reloadKey]);

  const rows = useMemo(() => (data ? buildQueue(data) : []), [data]);

  // Keep a valid selection: the deep-linked submission if it exists, otherwise the first row.
  const selected = rows.find((row) => row.submission.id === selectedId) ?? rows[0];
  const shownId = selected?.submission.id;
  useEffect(() => {
    if (shownId) setReviewParams(shownId);
  }, [shownId]);
  useEffect(() => () => setReviewParams(null), []);

  const visible = filterRows(rows, filter);
  const counts = countByFilter(rows);

  return (
    <section aria-labelledby="ai-review-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="ai-review-title" className="text-lg font-semibold">AI review</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Track AI reviews of consultant submissions and find their feedback. Basic checks formatting and consistency; Advanced checks content,
          evidence and alignment with the client.
        </p>
      </div>

      {client.mocked && (
        <div role="note" className="flex gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning)]">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Demo data.</span> These sample submissions for a fictional client are the same for every project, and
            reviews are simulated in your browser: no file is read and no model is called. Real submissions{projectName ? ` for ${projectName}` : ''} appear
            here once the review service is connected.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-3 text-sm">
          <span>{error}</span>
          <button type="button" className="rounded border px-3 py-1" onClick={() => setReloadKey((key) => key + 1)}>Retry</button>
        </div>
      )}

      {!data ? (
        !error && <p role="status">Loading AI reviews...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No submissions yet. They appear here when consultants submit slides or whitepapers.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ReviewQueueList
            rows={visible}
            counts={counts}
            filter={filter}
            onFilter={setFilter}
            selectedId={selected?.submission.id ?? ''}
            onSelect={setSelectedId}
            now={now}
          />
          {selected && <ReviewDetail row={selected} now={now} />}
        </div>
      )}
    </section>
  );
}
