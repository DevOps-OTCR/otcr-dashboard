import { useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { LEVELS } from './copy';
import { MAX_FOCUS_NOTE, type ReviewLevel, type ReviewSubmission } from './types';

type Props = {
  submission: ReviewSubmission;
  initialLevel: ReviewLevel;
  /** True when the project has no saved overview or SOW for Advanced review to check against. */
  projectContextMissing: boolean;
  onOpenProjectContext?: () => void;
  onSubmit: (level: ReviewLevel, focusNote: string) => Promise<void>;
  onCancel: () => void;
};

export function RequestReviewForm({ submission, initialLevel, projectContextMissing, onOpenProjectContext, onSubmit, onCancel }: Props) {
  const [level, setLevel] = useState<ReviewLevel>(initialLevel);
  const [focusNote, setFocusNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const id = useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(level, focusNote);
    } catch (err) {
      // The form stays open with the PM's choices so they can try again.
      setError(err instanceof Error && err.message ? err.message : 'Could not start the review. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-labelledby={`${id}-title`}
      className="space-y-3 rounded-[var(--radius-md)] border border-[var(--primary)] bg-[var(--card)] p-4"
    >
      <div>
        <h4 id={`${id}-title`} className="font-semibold">Request AI review</h4>
        <p className="text-sm text-[var(--text-muted)]">
          {submission.deliverableTitle}, version {submission.version}. The reviewer only comments; it never edits the file.
        </p>
      </div>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Review level</legend>
        {(Object.keys(LEVELS) as ReviewLevel[]).map((option) => {
          const copy = LEVELS[option];
          const checked = level === option;
          return (
            <label
              key={option}
              className={`flex cursor-pointer gap-2 rounded-[var(--radius-md)] border p-3 text-sm ${
                checked ? 'border-[var(--primary)] bg-[var(--surface-muted)]' : 'border-[var(--border)]'
              }`}
            >
              <input
                type="radio"
                name={`${id}-level`}
                value={option}
                checked={checked}
                onChange={() => setLevel(option)}
                aria-describedby={`${id}-${option}-checks`}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold">
                  {copy.label}: {copy.tagline}
                </span>
                <span id={`${id}-${option}-checks`} className="block text-[var(--text-muted)]">
                  {copy.checks}
                </span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">{copy.estimate}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {level === 'ADVANCED' && (
        <>
          {projectContextMissing && (
            <div role="note" className="flex gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                This project has no saved overview or SOW. Advanced review checks alignment against them, so its feedback will be less specific.{' '}
                {onOpenProjectContext && (
                  <button type="button" onClick={onOpenProjectContext} className="font-semibold underline">
                    Add them in Project Context
                  </button>
                )}
              </p>
            </div>
          )}
          <label className="block text-sm">
            <span className="font-medium">What should the reviewer focus on?</span> <span className="text-[var(--text-muted)]">(optional)</span>
            <textarea
              value={focusNote}
              onChange={(event) => setFocusNote(event.target.value)}
              maxLength={MAX_FOCUS_NOTE}
              rows={2}
              placeholder="For example: check the recommendation against what the client asked for on the last call."
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] p-2"
            />
            <span className="block text-right text-xs text-[var(--text-muted)]">
              {focusNote.length}/{MAX_FOCUS_NOTE}
            </span>
          </label>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-[var(--radius-sm)] bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60"
        >
          {submitting ? 'Starting…' : `Start ${LEVELS[level].label} review`}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
