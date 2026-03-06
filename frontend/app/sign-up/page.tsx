'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { onboardingAPI } from '@/lib/api';

const ROLE_OPTIONS = [
  { value: 'CONSULTANT', label: 'Consultant' },
  { value: 'LC', label: 'Lead Consultant' },
  { value: 'PM', label: 'Project Manager' },
  { value: 'PARTNER', label: 'Partner' },
] as const;

export default function SignUpPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [requestedRole, setRequestedRole] = useState<(typeof ROLE_OPTIONS)[number]['value']>('CONSULTANT');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) {
      setError('Name and university email are required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await onboardingAPI.createRequest({
        name: name.trim(),
        email: email.trim(),
        requestedRole,
      });

      if (res.data?.success === false) {
        throw new Error(res.data?.message || 'Failed to submit request');
      }

      setName('');
      setEmail('');
      setRequestedRole('CONSULTANT');
      setMessage('Request submitted. A Partner or Admin will review it before access is granted.');
    } catch (err: any) {
      const nextError =
        err?.response?.data?.message ??
        err?.message ??
        'Failed to submit onboarding request.';
      setError(Array.isArray(nextError) ? nextError.join(', ') : String(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-xl shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[var(--primary)]" />
            Request Dashboard Access
          </CardTitle>
          <CardDescription>
            Submit your information once. A Partner or Admin will approve your role-based access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">University Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="netID@illinois.edu"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Role In Firm</label>
            <select
              value={requestedRole}
              onChange={(e) => setRequestedRole(e.target.value as (typeof ROLE_OPTIONS)[number]['value'])}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <Button onClick={handleSubmit} loading={submitting} disabled={!name.trim() || !email.trim()}>
            Submit Request
          </Button>

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

          <p className="text-sm text-[var(--foreground)]/65">
            Already approved? <Link href="/sign-in" className="text-[var(--primary)] hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
