'use client';

import { useEffect, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { feedbackAPI, setAuthToken } from '@/lib/api';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';

type FormType = 'DASHBOARD_FEEDBACK' | 'ANONYMOUS_FEEDBACK' | 'PRC';
type Urgency = 'VERY_URGENT' | 'SOMEWHAT_URGENT' | 'NOT_VERY_URGENT';

export type StoredFormSubmission = {
  id: string;
  formType: FormType;
  problem: string | null;
  description: string;
  urgency: Urgency | null;
  contactName: string | null;
  contactEmail: string | null;
  submitterName: string | null;
  createdAt: string;
};

type FormPageProps = {
  formType: FormType;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  submitLabel: string;
  formFields: ReactNode;
  onSubmit: () => {
    payload: {
      problem?: string;
      description: string;
      urgency?: Urgency;
      contactName?: string;
      contactEmail?: string;
    } | null;
    validationError?: string;
    reset?: () => void;
  };
  reviewTitle: string;
  reviewDescription?: string;
  canReview: (role: AppRole) => boolean;
  renderSubmission: (submission: StoredFormSubmission) => ReactNode;
};

function parseApiError(err: any, fallback: string): string {
  const message = err?.response?.data?.message ?? err?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

export function FormPage({
  formType,
  title,
  description,
  icon: Icon,
  submitLabel,
  formFields,
  onSubmit,
  reviewTitle,
  reviewDescription,
  canReview,
  renderSubmission,
}: FormPageProps) {
  const session = useAuth();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissions, setSubmissions] = useState<StoredFormSubmission[]>([]);

  useEffect(() => {
    const syncRole = async () => {
      if (!session.isLoggedIn) return;
      const token = await session.getToken();
      const email = session.user?.email || '';
      setAuthToken(token || email || null);
      const resolvedRole = await getEffectiveRole(token, email);
      setRole(resolvedRole);
    };
    void syncRole();
  }, [session]);

  const showReview = canReview(role);

  useEffect(() => {
    const loadSubmissions = async () => {
      if (!session.isLoggedIn || !showReview) {
        setSubmissions([]);
        return;
      }

      setLoadingSubmissions(true);
      setError(null);
      try {
        const res = await feedbackAPI.listFormSubmissions(formType);
        const items = Array.isArray(res.data?.submissions) ? res.data.submissions : [];
        setSubmissions(items);
      } catch (err: any) {
        setError(parseApiError(err, `Failed to load ${title.toLowerCase()} submissions.`));
      } finally {
        setLoadingSubmissions(false);
      }
    };

    void loadSubmissions();
  }, [formType, session.isLoggedIn, showReview, title]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = onSubmit();
    if (result.validationError) {
      setError(result.validationError);
      setMessage(null);
      return;
    }
    const payload = result.payload;
    if (!payload) return;

    const submit = async () => {
      setSubmitting(true);
      setMessage(null);
      setError(null);
      try {
        await feedbackAPI.createFormSubmission(formType, payload);
        result.reset?.();
        setMessage(`${title} submitted successfully.`);
      } catch (err: any) {
        setError(parseApiError(err, `Failed to submit ${title.toLowerCase()}.`));
      } finally {
        setSubmitting(false);
      }
    };

    void submit();
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppNavbar role={role} currentPath="/forms" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-[var(--primary)]" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formFields}
              <Button type="submit" disabled={submitting} loading={submitting}>
                {submitLabel}
              </Button>
            </form>
          </CardContent>
        </Card>

        {showReview && (
          <Card>
            <CardHeader>
              <CardTitle>{reviewTitle}</CardTitle>
              {reviewDescription ? <CardDescription>{reviewDescription}</CardDescription> : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingSubmissions ? (
                <p className="text-sm text-[var(--foreground)]/60">Loading submissions...</p>
              ) : submissions.length === 0 ? (
                <p className="text-sm text-[var(--foreground)]/60">No submissions yet.</p>
              ) : (
                submissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 p-4 space-y-3"
                  >
                    {renderSubmission(submission)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

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
      </main>
    </div>
  );
}
