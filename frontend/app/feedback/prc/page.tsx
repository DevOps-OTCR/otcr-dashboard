'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { FormPage } from '@/components/forms/FormPage';

export default function PrcFormPage() {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [description, setDescription] = useState('');

  return (
    <FormPage
      formType="PRC"
      title="PRC Form"
      description="As a Firm, we strive to ensure that every member is comfortable voicing their opinions. Therefore, a PRC (Partner Review Committee) Form was created. This form is managed by the Partner team, but please contact the Internal Operations Partner with any questions."
      icon={ShieldAlert}
      submitLabel="Submit PRC Form"
      onSubmit={() => {
        if (!description.trim()) {
          return { payload: null, validationError: 'Please explain your concern in detail.' };
        }
        if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
          return { payload: null, validationError: 'Please provide a valid email address.' };
        }

        return {
          payload: {
            description: description.trim(),
            contactName: contactName.trim() || undefined,
            contactEmail: contactEmail.trim() || undefined,
          },
          reset: () => {
            setContactName('');
            setContactEmail('');
            setDescription('');
          },
        };
      }}
      reviewTitle="PRC Submissions"
      reviewDescription="Only partners and administrators can review these submissions."
      canReview={(role) => role === 'ADMIN' || role === 'PARTNER'}
      renderSubmission={(submission) => (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold">
              {submission.contactName || submission.contactEmail ? 'Contact information provided' : 'Anonymous PRC submission'}
            </p>
            <p className="text-xs text-[var(--foreground)]/60">
              {new Date(submission.createdAt).toLocaleString()}
            </p>
          </div>
          {(submission.contactName || submission.contactEmail) && (
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Contact Information</h3>
              <p className="text-sm text-[var(--foreground)]/85">
                {[submission.contactName, submission.contactEmail].filter(Boolean).join(' | ')}
              </p>
            </div>
          )}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Concern Details</h3>
            <p className="text-sm text-[var(--foreground)]/85 whitespace-pre-wrap">
              {submission.description}
            </p>
          </div>
        </>
      )}
      formFields={
        <>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/35 p-4 text-sm text-[var(--foreground)]/80 space-y-3">
            <p>
              This PRC Form is utilized for concerns within OTCR. If you believe that there is a concern with a OTCR member, please detail it here so that the Partner team is aware. All information here is confidential.
            </p>
            <p>
              If the situation is regarding a member of OTCR, the Partner team will speak with the person that is concerning.
            </p>
            <p>
              Please keep in mind that a PRC submission does NOT mean guarantee that the Partner team will take action.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold">If you are comfortable, please provide your name.</h2>
            <input
              type="text"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Optional name"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 text-sm"
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold">If you are comfortable, please provide your email address.</h2>
            <input
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="Optional email address"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 text-sm"
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold">
              Otherwise, please explain your concern in detail and provide the name of the person that you are referring to.
            </h2>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the concern in detail"
              rows={8}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 text-sm"
            />
          </div>
        </>
      }
    />
  );
}
