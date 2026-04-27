'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { FormPage } from '@/components/forms/FormPage';

export default function FeedbackPage() {
  const [problem, setProblem] = useState('');
  const [description, setDescription] = useState('');

  return (
    <FormPage
      formType="DASHBOARD_FEEDBACK"
      title="Dashboard Feedback Form"
      description="Submit product issues and improvement feedback for the OTCR dashboard."
      icon={MessageSquare}
      submitLabel="Submit Feedback"
      onSubmit={() => {
        if (!problem.trim()) {
          return { payload: null, validationError: 'Problem is required.' };
        }
        if (!description.trim()) {
          return { payload: null, validationError: 'Description is required.' };
        }

        const payload = {
          problem: problem.trim(),
          description: description.trim(),
        };

        return {
          payload,
          reset: () => {
            setProblem('');
            setDescription('');
          },
        };
      }}
      reviewTitle="Dashboard Feedback Submissions"
      reviewDescription="Only administrators can review these submissions."
      canReview={(role) => role === 'ADMIN'}
      renderSubmission={(submission) => (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold">{submission.submitterName ?? 'Team member'}</p>
            <p className="text-xs text-[var(--foreground)]/60">
              {new Date(submission.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Problem</h3>
            <p className="text-sm text-[var(--foreground)]/85">{submission.problem}</p>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Description</h3>
            <p className="text-sm text-[var(--foreground)]/85 whitespace-pre-wrap">
              {submission.description}
            </p>
          </div>
        </>
      )}
      formFields={
        <>
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Problem</h2>
            <input
              type="text"
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="Short summary of the issue"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 text-sm"
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold">Description</h2>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Include context, expected behavior, and impact"
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 text-sm"
            />
          </div>
        </>
      }
    />
  );
}
