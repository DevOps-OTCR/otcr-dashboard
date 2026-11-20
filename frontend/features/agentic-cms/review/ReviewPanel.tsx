'use client';

import { useEffect, useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { FAILURES, GOOGLE_DOCS_RESULTS, POWERPOINT_RESULTS } from './copy';
import { createHttpReviewClient } from './http-review-client';
import { createMockReviewClient, type MockReviewClient } from './mock-review-client';
import { buildQueue, countByFilter, filterRows, isActive, type QueueFilter } from './queue';
import { ReviewDetail, type ReviewActions } from './ReviewDetail';
import { ReviewQueueList } from './ReviewQueueList';
import type { GoogleDocsDemoResult, PowerPointDemoResult, ReviewClient, ReviewFailureKind, ReviewLevel, ReviewQueue } from './types';

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

/** True when the demo client should back the review UI rather than the review-job API. */
function reviewDemoEnabled(): boolean {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reviewDemo')) return true;
  return process.env.NEXT_PUBLIC_AGENTIC_REVIEW_DEMO === 'true';
}

/** Narrows a ReviewClient to the demo client so its demo controls can be used. */
export function isMock(c: ReviewClient): c is MockReviewClient {
  return c.mocked;
}

/**
 * The page's review client. Create it in the page, not the tab, so reviews started in
 * the demo survive switching tabs. The mock lives in memory: a reload or sign-out resets it.
 */
export function useReviewClient(demoProjectId?: string, viewerName?: string): ReviewClient | MockReviewClient {
  return useMemo(
    () => (reviewDemoEnabled() ? createMockReviewClient({ viewerName, demoProjectId }) : createHttpReviewClient()),
    [viewerName, demoProjectId],
  );
}

type Props = {
  client: ReviewClient | MockReviewClient;
  projectId: string;
  projectName?: string;
  /** The backend's edit permission for this project, from the project-context response. */
  canRequest: boolean;
  accessState: 'loading' | 'error' | 'ready';
  onRetryAccess: () => void;
  projectContextMissing: boolean;
  onOpenProjectContext?: () => void;
};

export function ReviewPanel(props: Props) {
  // Project switches reset the panel, but only leaving the tab clears its URL.
  useEffect(() => () => setReviewParams(null), []);
  return <ProjectReviewPanel key={props.projectId} {...props} />;
}

function ProjectReviewPanel({ client, projectId, projectName, canRequest: permitted, accessState, onRetryAccess, projectContextMissing, onOpenProjectContext }: Props) {
  const mock = isMock(client) ? client : null;
  const canRequest = accessState === 'ready' && permitted;
  const [nextFailure, setNextFailure] = useState<ReviewFailureKind | null>(() => mock?.nextFailure(projectId) ?? null);
  const [nextPowerPoint, setNextPowerPoint] = useState<PowerPointDemoResult | null>(() => mock?.nextPowerPointResult(projectId) ?? null);
  const [nextDocs, setNextDocs] = useState<GoogleDocsDemoResult | null>(() => mock?.nextDocsResult(projectId) ?? null);
  const [data, setData] = useState<ReviewQueue | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<QueueFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('submission'));
  // Bumping this reloads immediately (Retry, and after requesting a review).
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
          // Pin the first default before a retry or poll changes the queue order.
          // Explicit IDs (including an empty or unavailable link) stay untouched.
          setSelectedId((current) => current ?? buildQueue(next)[0]?.submission.id ?? null);
          setError('');
          setNow(Date.now());
          timer = window.setTimeout(poll, next.reviews.some((review) => isActive(review.status) || review.powerPoint?.postingInProgress || review.posting === 'in_progress') ? ACTIVE_POLL_MS : IDLE_POLL_MS);
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

  // Only default to the first row when no submission was requested in the URL.
  const selected = selectedId !== null ? rows.find((row) => row.submission.id === selectedId) : rows[0];
  const unavailable = data !== null && selectedId !== null && !selected;
  const shownId = selected?.submission.id;
  useEffect(() => {
    if (shownId) setReviewParams(shownId);
  }, [shownId]);

  const visible = filterRows(rows, filter);
  const counts = countByFilter(rows);

  // After a request or retry, reload at once and show that a planned demo failure was used.
  const afterChange = () => {
    setNextFailure(mock?.nextFailure(projectId) ?? null);
    setNextPowerPoint(mock?.nextPowerPointResult(projectId) ?? null);
    setNextDocs(mock?.nextDocsResult(projectId) ?? null);
    setReloadKey((key) => key + 1);
  };
  const actions: ReviewActions = {
    permissionsReady: accessState === 'ready',
    canRequest,
    projectContextMissing,
    onOpenProjectContext,
    request: async (submissionId: string, level: ReviewLevel, focusNote: string) => {
      await client.request({ projectId, submissionId, level, focusNote });
      afterChange();
    },
    retry: async (reviewId: string) => {
      await client.retry(projectId, reviewId);
      afterChange();
    },
    retryPosting: async (reviewId: string) => {
      if (mock) {
        await mock.retryPowerPointPosting(projectId, reviewId);
      } else {
        // Re-post only when the last attempt ended locked or errored; a fresh review rereads the file otherwise.
        await client.retry(projectId, reviewId);
      }
      afterChange();
    },
    // The real client posts to the file; the mock replays its simulated posting.
    post: async (reviewId: string) => {
      if (mock) {
        const queue = await mock.list(projectId);
        const review = queue.reviews.find((r) => r.id === reviewId);
        const submission = review && queue.submissions.find((s) => s.id === review.submissionId);
        if (submission?.format === 'slides') {
          await mock.retryPowerPointPosting(projectId, reviewId);
        }
        // Documents: the demo has no simulated post; the review is returned unchanged.
      } else {
        await client.post?.(projectId, reviewId);
      }
      afterChange();
    },
  };

  return (
    <section aria-labelledby="ai-review-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="ai-review-title" className="text-lg font-semibold">AI review</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Track AI reviews of consultant submissions and find their feedback. Basic checks routine quality and consistency; Advanced checks content,
          evidence and alignment with the client.
        </p>
      </div>

      {client.mocked && (
        <div role="note" className="flex gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning)]">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Demo data.</span> Fictional samples belong to the first accessible project; additional projects have empty review queues. All
            reviews are simulated in your browser: no file is read and no model is called. Real submissions{projectName ? ` for ${projectName}` : ''} appear
            here once the review service is connected.
          </p>
        </div>
      )}

      {accessState === 'loading' && <p role="status" className="text-sm text-[var(--text-muted)]">Checking review permissions...</p>}
      {accessState === 'error' && (
        <div role="alert" className="flex items-center gap-3 text-sm">
          <span>Could not check review permissions. Try again.</span>
          <button type="button" className="rounded border px-3 py-1" onClick={onRetryAccess}>Retry access check</button>
        </div>
      )}

      {mock && canRequest && (
        <details className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Demo controls</summary>
          <label className="mt-2 flex flex-wrap items-center gap-2">
            <span>Result of the next review you start or retry:</span>
            <select
              value={nextFailure ?? ''}
              onChange={(event) => {
                const kind = (event.target.value || null) as ReviewFailureKind | null;
                mock.setNextFailure(projectId, kind);
                setNextFailure(kind);
              }}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-2 py-1"
            >
              <option value="">Completes with feedback</option>
              {(Object.keys(FAILURES) as ReviewFailureKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  Fails: {FAILURES[kind].title}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 flex flex-wrap items-center gap-2">
            <span>Posting result of the next PowerPoint review or posting retry:</span>
            <select value={nextPowerPoint ?? ''} onChange={(event) => {
              const result = (event.target.value || null) as PowerPointDemoResult | null;
              mock.setNextPowerPointResult(projectId, result);
              setNextPowerPoint(result);
            }} className="min-w-0 max-w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-2 py-1">
              <option value="">Use sample’s default</option>
              {(Object.keys(POWERPOINT_RESULTS) as PowerPointDemoResult[]).map((result) => <option key={result} value={result}>{POWERPOINT_RESULTS[result].label}</option>)}
            </select>
          </label>
          <label className="mt-2 flex flex-wrap items-center gap-2">
            <span>Posting result of the next Google Docs review:</span>
            <select value={nextDocs ?? ''} onChange={(event) => {
              const result = (event.target.value || null) as GoogleDocsDemoResult | null;
              mock.setNextDocsResult(projectId, result);
              setNextDocs(result);
            }} className="min-w-0 max-w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-2 py-1">
              <option value="">Use sample’s default</option>
              {(Object.keys(GOOGLE_DOCS_RESULTS) as GoogleDocsDemoResult[]).map((result) => <option key={result} value={result}>{GOOGLE_DOCS_RESULTS[result]}</option>)}
            </select>
          </label>
          <p className="mt-2 text-[var(--text-muted)]">
            Google Docs samples: Market sizing starts unreviewed and simulates all comments added; Campus growth starts unreviewed and keeps two comments in CMS;
            Partnership proposal starts with a sharing failure that you can retry. Choose a Google Docs posting result above to see unconfirmed saves,
            a document that changed while posting, view-only access, or a comment attached to the wrong text.
          </p>
          <p className="mt-2 text-[var(--text-muted)]">PowerPoint samples: Campus launch simulates successful comments; Expansion roadmap simulates a changed deck; Partnership options simulates a locked deck. All start unreviewed.</p>
        </details>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-3 text-sm">
          <span>{error}</span>
          <button type="button" className="rounded border px-3 py-1" onClick={() => setReloadKey((key) => key + 1)}>Retry</button>
        </div>
      )}

      {unavailable && (
        <div role="status" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
          <p className="font-medium">Submission unavailable in this project.</p>
          <p>It may have been removed or belong to another project. Choose a submission from the queue or check the project selection.</p>
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
          {selected && <ReviewDetail key={selected.submission.id} row={selected} now={now} actions={actions} mocked={client.mocked} />}
        </div>
      )}
    </section>
  );
}
