'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ROLE_FULL_LABELS, type AppRole } from '@/lib/permissions';
import { CMS_ROLES, personName, type OnboardingRequest } from './types';

export function OnboardingQueue({ requests, busy, onReview }: {
  requests: OnboardingRequest[]; busy: boolean;
  onReview: (request: OnboardingRequest, action: 'approve' | 'reject', role: AppRole, notes: string) => Promise<void>;
}) {
  const [status, setStatus] = useState('PENDING');
  const [roles, setRoles] = useState<Record<string, AppRole>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const visible = requests.filter(request => !status || request.status === status);
  return <section aria-labelledby="onboarding-title" className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="onboarding-title" className="text-lg font-semibold">Onboarding requests</h2>
      <label className="flex items-center gap-2 text-sm">Request status
        <select className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="">All requests</option>
        </select>
      </label>
    </div>
    {!visible.length && <p>{status === 'PENDING' ? 'No pending onboarding requests.' : 'No requests match this status.'}</p>}
    {visible.map(request => <article key={request.id} aria-label={`Request from ${request.email}`} className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/50 p-4 space-y-3">
      <div><h3 className="font-semibold">{request.name}</h3><p className="text-sm break-all">{request.email}</p></div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-[var(--foreground)]/65">Requested role</dt><dd>{ROLE_FULL_LABELS[request.requestedRole]}</dd></div>
        <div><dt className="text-[var(--foreground)]/65">Status</dt><dd>{request.status}</dd></div>
        <div><dt className="text-[var(--foreground)]/65">Submitted</dt><dd>{new Date(request.createdAt).toLocaleString()}</dd></div>
        {request.grantedRole && <div><dt className="text-[var(--foreground)]/65">Granted role</dt><dd>{ROLE_FULL_LABELS[request.grantedRole]}</dd></div>}
        {request.reviewedAt && <div><dt className="text-[var(--foreground)]/65">Reviewed</dt><dd>{new Date(request.reviewedAt).toLocaleString()}</dd></div>}
        {request.reviewer && <div><dt className="text-[var(--foreground)]/65">Reviewer</dt><dd>{personName(request.reviewer)}</dd></div>}
        {request.reviewerNotes && <div className="sm:col-span-2"><dt className="text-[var(--foreground)]/65">Reviewer notes</dt><dd className="whitespace-pre-wrap break-words">{request.reviewerNotes}</dd></div>}
      </dl>
      {request.status === 'PENDING' && <div className="space-y-3">
        <label className="flex flex-col gap-1 text-sm">Grant role
          <select className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2" disabled={busy}
            value={roles[request.id] ?? request.requestedRole} onChange={e => setRoles(current => ({ ...current, [request.id]: e.target.value as AppRole }))}>
            {CMS_ROLES.map(role => <option key={role} value={role}>{ROLE_FULL_LABELS[role]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Reviewer notes
          <textarea className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2" disabled={busy} rows={2}
            value={notes[request.id] ?? ''} onChange={e => setNotes(current => ({ ...current, [request.id]: e.target.value }))} />
        </label>
        <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void onReview(request, 'approve', roles[request.id] ?? request.requestedRole, notes[request.id] ?? '')}>Approve</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void onReview(request, 'reject', roles[request.id] ?? request.requestedRole, notes[request.id] ?? '')}>Reject</Button></div>
      </div>}
    </article>)}
  </section>;
}
