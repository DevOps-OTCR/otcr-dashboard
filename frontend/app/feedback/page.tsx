'use client';

import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';
import { feedbackAPI, setAuthToken } from '@/lib/api';

type FeedbackSubmission = {
  id: string;
  problem: string;
  description: string;
  submitterName: string;
  createdAt: string;
};

function parseApiError(err: any, fallback: string): string {
  const message = err?.response?.data?.message ?? err?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : String(message);
}

export default function FeedbackPage() {
  const session = useAuth();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [problem, setProblem] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([]);

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

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  const canSubmit = true;
  const canReview = role === 'ADMIN';

  useEffect(() => {
    const loadSubmissions = async () => {
      if (!session.isLoggedIn || !canReview) {
        setSubmissions([]);
        return;
      }

      setLoadingSubmissions(true);
      setError(null);
      try {
        const res = await feedbackAPI.listSubmissions();
        const items = Array.isArray(res.data?.submissions) ? res.data.submissions : [];
        setSubmissions(items);
      } catch (err: any) {
        setError(parseApiError(err, 'Failed to load feedback submissions.'));
      } finally {
        setLoadingSubmissions(false);
      }
    };

    void loadSubmissions();
  }, [session.isLoggedIn, canReview]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!problem.trim() || !description.trim() || !canSubmit) return;

    const submit = async () => {
      setSubmitting(true);
      setMessage(null);
      setError(null);
      try {
        await feedbackAPI.createSubmission({
          problem: problem.trim(),
          description: description.trim(),
        });
        setMessage('Feedback submitted successfully.');
        setProblem('');
        setDescription('');
      } catch (err: any) {
        setError(parseApiError(err, 'Failed to submit feedback.'));
      } finally {
        setSubmitting(false);
      }
    };

    void submit();
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppNavbar role={role} currentPath="/feedback" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        {canSubmit && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[var(--primary)]" />
                Feedback Form
              </CardTitle>
              <CardDescription>Submit product issues and improvement feedback.</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
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

                <Button type="submit" disabled={submitting || !problem.trim() || !description.trim()}>
                  {submitting ? 'Submitting...' : 'Submit Feedback'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {canReview && (
          <Card>
            <CardHeader>
              <CardTitle>Feedback Submissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingSubmissions ? (
                <p className="text-sm text-[var(--foreground)]/60">Loading submissions...</p>
              ) : submissions.length === 0 ? (
                <p className="text-sm text-[var(--foreground)]/60">No feedback submissions yet.</p>
              ) : (
                submissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{submission.submitterName}</p>
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
