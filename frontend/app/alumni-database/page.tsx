'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Building2, ChevronLeft, ChevronRight, GraduationCap, Search } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { alumniField, type AlumniDataset, type AlumniRecord } from '@/lib/alumni-data';
import { getActualUserRole, getEffectiveRole, type AppRole } from '@/lib/permissions';
import { alumniAPI, setAuthToken } from '@/lib/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

function normalizedEmployer(r: AlumniRecord): string {
  return alumniField(r, 'employer').trim().toLowerCase();
}

export default function AlumniDatabasePage() {
  const session = useAuth();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [dataset, setDataset] = useState<AlumniDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [companySearch, personSearch]);

  useEffect(() => {
    if (!session.isLoggedIn || session.loading) return;
    let cancelled = false;
    const load = async () => {
      const token = await session.getToken();
      const email = session.user?.email || '';
      setAuthToken(token || email || null);
      try {
        const resolvedRole = await getEffectiveRole(token, email);
        if (!cancelled) setRole(resolvedRole);
      } catch {
        if (!cancelled) setRole(getActualUserRole(email));
      }
      try {
        const { data } = await alumniAPI.getDataset();
        if (cancelled) return;
        setDataset(data as AlumniDataset);
        setLoadError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setDataset(null);
        let message = 'Failed to load alumni data';
        if (axios.isAxiosError(e)) {
          const status = e.response?.status;
          if (status === 401 || status === 403) message = 'You are not signed in or lack access to alumni data.';
          else if (status === 404) message = 'Alumni file is missing on the server (set backend/data/alumni.json or ALUMNI_DATA_PATH).';
          else if (typeof e.response?.data === 'object' && e.response.data && 'message' in e.response.data)
            message = String((e.response.data as { message?: string }).message);
          else message = e.message || message;
        } else if (e instanceof Error) message = e.message;
        setLoadError(message);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session.isLoggedIn, session.loading, session]);

  const employersSorted = useMemo(() => {
    if (!dataset) return [];
    const set = new Set<string>();
    for (const r of dataset.rows) {
      const e = alumniField(r, 'employer').trim();
      if (e) set.add(e);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [dataset]);

  const filterRows = useCallback(
    (rows: AlumniRecord[]) => {
      const compQ = companySearch.trim().toLowerCase();
      const personQ = personSearch.trim().toLowerCase();

      return rows.filter((r) => {
        const empLower = normalizedEmployer(r);
        if (compQ) {
          if (!empLower) return false;
          if (!empLower.includes(compQ)) return false;
        }

        if (personQ) {
          const blob = [
            alumniField(r, 'name'),
            alumniField(r, 'jobTitle'),
            alumniField(r, 'major'),
            alumniField(r, 'industry'),
            alumniField(r, 'graduateDegrees'),
          ]
            .join(' ')
            .toLowerCase();
          if (!blob.includes(personQ)) return false;
        }

        return true;
      });
    },
    [companySearch, personSearch],
  );

  const filteredSorted = useMemo(() => {
    if (!dataset) return [];
    const rows = filterRows(dataset.rows);
    return [...rows].sort((a, b) => {
      const ea = normalizedEmployer(a) || '\uffff';
      const eb = normalizedEmployer(b) || '\uffff';
      const c = ea.localeCompare(eb, undefined, { sensitivity: 'base' });
      if (c !== 0) return c;
      return alumniField(a, 'name').localeCompare(alumniField(b, 'name'), undefined, {
        sensitivity: 'base',
      });
    });
  }, [dataset, filterRows]);

  const totalCount = filteredSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    setPageIndex((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  const safePage = Math.min(pageIndex, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = filteredSorted.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = totalCount === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, totalCount);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  const displayOrDash = (v: string) => (v.trim() ? v : '—');

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppNavbar role={role} currentPath="/alumni-database" />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Card className="bg-[var(--card)]/95 border-[var(--border)]">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <GraduationCap className="w-6 h-6 text-[var(--primary)]" />
              Alumni Database
            </CardTitle>
            <CardDescription>
              Browse and filter cohort information by current employer or related text.
            </CardDescription>
            {dataset && (
              <p className="text-xs text-[var(--foreground)]/55 pt-1">
                Last imported {new Date(dataset.generatedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}{' '}
                · {dataset.rows.length} entries · sheet &ldquo;{dataset.sheet}&rdquo;
              </p>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {loadError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
                Could not load data: {loadError}
              </div>
            )}

            {dataset && !loadError && (
              <>
                <div className="flex flex-col lg:flex-row gap-4">
                  <label className="flex-1 space-y-1.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--foreground)]/85">
                      <Building2 className="w-4 h-4 text-[var(--primary)]" />
                      Search by employer
                    </span>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/40" />
                      <input
                        type="text"
                        value={companySearch}
                        onChange={(e) => setCompanySearch(e.target.value)}
                        placeholder="Company name…"
                        className={cn(
                          'w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-2.5 pl-9 pr-3 text-sm outline-none ring-2 ring-transparent transition-shadow',
                          'focus:ring-[var(--primary)]/25 focus:border-[var(--primary)]/40',
                        )}
                        list="alumni-employer-suggestions"
                      />
                      <datalist id="alumni-employer-suggestions">
                        {employersSorted.slice(0, 500).map((e) => (
                          <option key={e} value={e} />
                        ))}
                      </datalist>
                    </div>
                    <span className="text-xs text-[var(--foreground)]/50">
                      {employersSorted.length} distinct employers · partial match
                    </span>
                  </label>

                  <label className="flex-1 space-y-1.5 lg:max-w-md">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--foreground)]/85">
                      <Search className="w-4 h-4 text-[var(--primary)]" />
                      Filter by person or role text
                    </span>
                    <input
                      type="text"
                      value={personSearch}
                      onChange={(e) => setPersonSearch(e.target.value)}
                      placeholder="Name, title, major, industry…"
                      className={cn(
                        'w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-2.5 px-3 text-sm outline-none ring-2 ring-transparent transition-shadow',
                        'focus:ring-[var(--primary)]/25 focus:border-[var(--primary)]/40',
                      )}
                    />
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-sm text-[var(--foreground)]/65">
                    {totalCount === 0 ? (
                      <>
                        No matching records
                        {dataset.rows.length > 0 ? ` (${dataset.rows.length} total in dataset)` : ''}.
                      </>
                    ) : (
                      <>
                        Showing{' '}
                        <strong className="text-[var(--foreground)]">
                          {rangeStart}–{rangeEnd}
                        </strong>{' '}
                        of <strong className="text-[var(--foreground)]">{totalCount}</strong>
                        {totalCount !== dataset.rows.length ? (
                          <>
                            {' '}
                            filtered (<strong className="text-[var(--foreground)]">{dataset.rows.length}</strong> total)
                          </>
                        ) : (
                          ' records'
                        )}
                        .
                      </>
                    )}
                  </p>

                  {totalCount > 0 ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        aria-label="Previous page"
                        disabled={safePage <= 0}
                        onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                        className={cn(
                          'inline-flex items-center justify-center rounded-xl border px-3 py-2 transition-colors',
                          safePage <= 0
                            ? 'border-[var(--border)] text-[var(--foreground)]/35 cursor-not-allowed'
                            : 'border-[var(--border)] hover:bg-[var(--accent)] text-[var(--foreground)]',
                        )}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className="text-sm tabular-nums text-[var(--foreground)]/80 min-w-[8rem] text-center">
                        Page {safePage + 1} of {totalPages}
                      </span>
                      <button
                        type="button"
                        aria-label="Next page"
                        disabled={safePage >= totalPages - 1}
                        onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                        className={cn(
                          'inline-flex items-center justify-center rounded-xl border px-3 py-2 transition-colors',
                          safePage >= totalPages - 1
                            ? 'border-[var(--border)] text-[var(--foreground)]/35 cursor-not-allowed'
                            : 'border-[var(--border)] hover:bg-[var(--accent)] text-[var(--foreground)]',
                        )}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/30 overflow-hidden overflow-x-auto">
                  <table className="min-w-[960px] w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--card)] border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--foreground)]/55">
                        <th className="py-3 pl-4 pr-2 font-semibold">Name</th>
                        <th className="py-3 px-2 font-semibold w-28">Class</th>
                        <th className="py-3 px-2 font-semibold min-w-[140px]">Major / minor</th>
                        <th className="py-3 px-2 font-semibold min-w-[160px]">Employer</th>
                        <th className="py-3 px-2 font-semibold min-w-[120px]">Industry</th>
                        <th className="py-3 pr-4 pl-2 font-semibold min-w-[180px]">Title</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => {
                        const majors = [
                          alumniField(r, 'major'),
                          alumniField(r, 'minor'),
                          alumniField(r, 'graduateDegrees'),
                        ]
                          .map((x) => x.trim())
                          .filter(Boolean);

                        const rowHue =
                          normalizedEmployer(r) === '' ? 'bg-amber-500/[0.04]' : '';

                        return (
                          <tr
                            key={r.id}
                            className={cn(
                              'border-t border-[var(--border)]/80 hover:bg-[var(--accent)]/50 transition-colors align-top',
                              rowHue,
                            )}
                          >
                            <td className="py-3 pl-4 pr-2 font-medium">
                              {displayOrDash(alumniField(r, 'name'))}
                            </td>
                            <td className="py-3 px-2 text-[var(--foreground)]/80 whitespace-nowrap">
                              {displayOrDash(alumniField(r, 'graduationYear'))}
                            </td>
                            <td className="py-3 px-2 text-[var(--foreground)]/80">
                              {majors.length ? majors.join(' · ') : '—'}
                            </td>
                            <td className="py-3 px-2 text-[var(--foreground)]">
                              <span className={cn(normalizedEmployer(r) === '' && 'italic text-[var(--foreground)]/50')}>
                                {displayOrDash(alumniField(r, 'employer'))}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-[var(--foreground)]/80">
                              {displayOrDash(alumniField(r, 'industry'))}
                            </td>
                            <td className="py-3 pr-4 pl-2 text-[var(--foreground)]/90">
                              {displayOrDash(alumniField(r, 'jobTitle'))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
