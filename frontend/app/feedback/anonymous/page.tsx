'use client';

import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { FormPage } from '@/components/forms/FormPage';

const urgencyOptions = [
  { value: 'VERY_URGENT', label: 'Very urgent' },
  { value: 'SOMEWHAT_URGENT', label: 'Somewhat urgent' },
  { value: 'NOT_VERY_URGENT', label: 'Not very urgent' },
] as const;

export default function AnonymousFeedbackPage() {
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<(typeof urgencyOptions)[number]['value'] | ''>('');

  return (
    <FormPage
      formType="ANONYMOUS_FEEDBACK"
      title="Anonymous Feedback Form"
      description="Please fill this out for any firmwide issues/tips, as well as project issues you may have!"
      icon={TriangleAlert}
      submitLabel="Submit Anonymous Feedback"
      onSubmit={() => {
        if (!description.trim()) {
          return { payload: null, validationError: 'Feedback is required.' };
        }
        if (!urgency) {
          return { payload: null, validationError: 'Urgency is required.' };
        }

        return {
          payload: {
            description: description.trim(),
            urgency,
          },
          reset: () => {
            setDescription('');
            setUrgency('');
          },
        };
      }}
      reviewTitle="Anonymous Feedback Submissions"
      reviewDescription="Only partners and administrators can review these submissions."
      canReview={(role) => role === 'ADMIN' || role === 'PARTNER'}
      renderSubmission={(submission) => (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold">Anonymous submission</p>
            <p className="text-xs text-[var(--foreground)]/60">
              {new Date(submission.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Urgency</h3>
            <p className="text-sm text-[var(--foreground)]/85">
              {submission.urgency?.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (m) => m.toUpperCase())}
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Feedback</h3>
            <p className="text-sm text-[var(--foreground)]/85 whitespace-pre-wrap">
              {submission.description}
            </p>
          </div>
        </>
      )}
      formFields={
        <>
          <div className="space-y-2">
            <h2 className="text-base font-semibold">What is your feedback for OTCR?</h2>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Share the issue, tip, or experience you want the team to know about"
              rows={7}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 text-sm"
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-base font-semibold">How urgent is this issue?</legend>
            <div className="space-y-2">
              {urgencyOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-3 text-sm"
                >
                  <input
                    type="radio"
                    name="anonymous-feedback-urgency"
                    value={option.value}
                    checked={urgency === option.value}
                    onChange={(event) => setUrgency(event.target.value as (typeof urgencyOptions)[number]['value'])}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      }
    />
  );
}
