'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, GraduationCap, Search, X } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { PageLoading } from '@/components/PageLoading';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  alumniField,
  alumniMajors,
  DEFAULT_ALUMNI_SORT,
  filterAlumni,
  sortAlumni,
  type AlumniDataset,
  type AlumniRecord,
  type AlumniSort,
  type AlumniSortKey,
} from '@/lib/alumni-data';
import { getDevRoleOverride, getEffectiveRole, getUserRole, type AppRole } from '@/lib/permissions';
import { alumniAPI, setAuthToken } from '@/lib/api';
import { useNavigationSnapshot } from '@/lib/use-navigation-snapshot';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

type AlumniSnapshot = {
  role: AppRole;
  dataset: AlumniDataset;
  search: string;
  sort: AlumniSort;
  pageIndex: number;
};

const COLUMNS: { key: AlumniSortKey; label: string; className: string }[] = [
  { key: 'name', label: 'Name', className: 'pl-4 pr-2' },
  { key: 'graduationYear', label: 'Class', className: 'px-2 w-28' },
  { key: 'majors', label: 'Major / minor', className: 'px-2 min-w-[140px]' },
  { key: 'employer', label: 'Employer', className: 'px-2 min-w-[160px]' },
  { key: 'industry', label: 'Industry', className: 'px-2 min-w-[120px]' },
  { key: 'jobTitle', label: 'Title', className: 'pr-4 pl-2 min-w-[180px]' },
];

function normalizedEmployer(r: AlumniRecord): string {
  return alumniField(r, 'employer').trim().toLowerCase();
}

export default function AlumniDatabasePage() {
  const session = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Once auth init finishes, bounce signed-out users to sign-in instead of
    // leaving them stuck on the loader (deep links / bookmarks).
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in');
    }
  }, [session.loading, session.isLoggedIn, router]);

  if (session.loading || !session.isLoggedIn) return <FullScreenLoader />;

  // Reset mounted state when the account or permission override changes.
  return <AlumniTable key={JSON.stringify([session.user?.email, getDevRoleOverride()])} />;
}

function AlumniTable() {
  const { getToken, user } = useAuth();
  const email = user?.email;
  const { snapshot, saveSnapshot } = useNavigationSnapshot<AlumniSnapshot>('alumni-database', email);
  const [role, setRole] = useState<AppRole>(() => snapshot?.role ?? getUserRole(email));
  const [dataset, setDataset] = useState<AlumniDataset | null>(snapshot?.dataset ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState(snapshot?.search ?? '');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [sort, setSort] = useState<AlumniSort>(snapshot?.sort ?? DEFAULT_ALUMNI_SORT);
  const [pageIndex, setPageIndex] = useState(snapshot?.pageIndex ?? 0);
  const [refreshing, setRefreshing] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const updateSearch = (value: string) => {
    setSearch(value);
    setPageIndex(0);
  };

  const clearSearch = () => {
    updateSearch('');
    searchInputRef.current?.focus();
  };

  const toggleSort = (key: AlumniSortKey) => {
    setPageIndex(0);
    setSort((s) =>
      s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' },
    );
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        if (cancelled) return;
        setAuthToken(token || email || null);
        try {
          const resolvedRole = await getEffectiveRole(token, email);
          if (cancelled) return;
          setRole(resolvedRole);
        } catch {
          if (cancelled) return;
          setRole(getUserRole(email));
        }
        const { data } = await alumniAPI.getDataset(refreshVersion > 0);
        if (cancelled) return;
        setDataset(data);
        setLoadError(null);
      } catch (e: unknown) {
        if (cancelled) return;
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
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, email, refreshVersion]);

  const filteredSorted = useMemo(() => {
    if (!dataset) return [];
    return sortAlumni(filterAlumni(dataset.rows, search), sort);
  }, [dataset, search, sort]);

  const totalCount = filteredSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const safePage = Math.min(pageIndex, totalPages - 1);
  if (pageIndex !== safePage) setPageIndex(safePage);

  useEffect(() => {
    if (dataset) saveSnapshot({ role, dataset, search, sort, pageIndex: safePage });
  }, [dataset, role, search, sort, safePage, saveSnapshot]);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = filteredSorted.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = totalCount === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, totalCount);

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
              Search by name, employer, or title, and click a column header to sort.
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
            <button
              type="button"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true);
                setLoadError(null);
                setRefreshVersion((value) => value + 1);
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--accent)] disabled:opacity-50"
            >
              {refreshing ? 'Refreshing alumni data...' : 'Refresh alumni data'}
            </button>
            {!dataset && refreshing && <PageLoading />}
            {loadError && (
              <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
                {dataset ? 'Could not refresh data' : 'Could not load data'}: {loadError}
              </div>
            )}

            {dataset && (
              <>
                <div className="relative max-w-2xl">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/40" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={search}
                    onChange={(e) => updateSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') clearSearch();
                    }}
                    placeholder="Search by name, employer, or title…"
                    aria-label="Search alumni by name, employer, or title"
                    className={cn(
                      'w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-2.5 pl-9 pr-10 text-sm outline-none ring-2 ring-transparent transition-shadow',
                      'focus:ring-[var(--primary)]/25 focus:border-[var(--primary)]/40',
                      '[&::-webkit-search-cancel-button]:appearance-none',
                    )}
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={clearSearch}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[var(--foreground)]/50 hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-sm text-[var(--foreground)]/65">
                    {totalCount === 0 ? (
                      <>
                        No matching records
                        {dataset.rows.length > 0 ? ` (${dataset.rows.length} total in dataset)` : ''}.
                        {search && (
                          <>
                            {' '}
                            <button
                              type="button"
                              onClick={clearSearch}
                              className="font-medium text-[var(--primary)] hover:underline"
                            >
                              Clear search
                            </button>
                          </>
                        )}
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
                        onClick={() => setPageIndex(Math.max(0, safePage - 1))}
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
                        onClick={() => setPageIndex(Math.min(totalPages - 1, safePage + 1))}
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
                        {COLUMNS.map(({ key, label, className }) => {
                          const active = sort.key === key;
                          const SortIcon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                          return (
                            <th
                              key={key}
                              scope="col"
                              aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                              className={cn('py-1.5 font-semibold', className)}
                            >
                              <button
                                type="button"
                                onClick={() => toggleSort(key)}
                                title={`Sort by ${label.toLowerCase()}`}
                                className={cn(
                                  'group -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1.5 font-semibold uppercase tracking-wide transition-colors',
                                  'hover:bg-[var(--accent)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40',
                                  active && 'text-[var(--foreground)]',
                                )}
                              >
                                {label}
                                <SortIcon
                                  aria-hidden="true"
                                  className={cn(
                                    'w-3.5 h-3.5 shrink-0',
                                    active
                                      ? 'text-[var(--primary)]'
                                      : 'opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60',
                                  )}
                                />
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => {
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
                              {displayOrDash(alumniMajors(r))}
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
