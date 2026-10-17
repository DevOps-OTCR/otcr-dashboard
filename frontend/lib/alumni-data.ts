/** Shape of frontend/public/data/alumni.json (generated via scripts/import-alumni.cjs). */

export type AlumniRecord = {
  id: number;
  fields: Record<string, string>;
};

export type AlumniDataset = {
  generatedAt: string;
  sourceFile: string;
  sheet: string;
  headerRow: string[];
  rows: AlumniRecord[];
};

/** Normalized accessors for workbook keys produced by import script. */
export function alumniField(record: AlumniRecord, key: keyof typeof ALUMNI_FIELD_KEYS): string {
  const k = ALUMNI_FIELD_KEYS[key];
  return record.fields[k] ?? '';
}

const ALUMNI_FIELD_KEYS = {
  name: 'name',
  graduationYear: 'graduationyear',
  major: 'major',
  minor: 'minor',
  graduateDegrees: 'graduatedegrees',
  employer: 'currentemployer',
  industry: 'currentindustry',
  jobTitle: 'currentjobtitle',
  notes: 'notes',
} as const;

export type AlumniSortKey = 'name' | 'graduationYear' | 'majors' | 'employer' | 'industry' | 'jobTitle';
export type SortDirection = 'asc' | 'desc';
export type AlumniSort = { key: AlumniSortKey; direction: SortDirection };

/** Matches the page's initial order: employer A–Z, then name. */
export const DEFAULT_ALUMNI_SORT: AlumniSort = { key: 'employer', direction: 'asc' };

/** Major, minor, and graduate degrees as shown in the "Major / minor" column. */
export function alumniMajors(record: AlumniRecord): string {
  return [alumniField(record, 'major'), alumniField(record, 'minor'), alumniField(record, 'graduateDegrees')]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' · ');
}

const SEARCH_KEYS = ['name', 'graduationYear', 'employer', 'jobTitle', 'major', 'minor', 'graduateDegrees', 'industry'] as const;

/** Case-insensitive substring match; a hit in any searchable field includes the record. */
export function filterAlumni(rows: AlumniRecord[], query: string): AlumniRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => SEARCH_KEYS.some((k) => alumniField(r, k).toLowerCase().includes(q)));
}

function graduationYear(record: AlumniRecord): number | null {
  const match = alumniField(record, 'graduationYear').match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function sortText(record: AlumniRecord, key: Exclude<AlumniSortKey, 'graduationYear'>): string {
  return (key === 'majors' ? alumniMajors(record) : alumniField(record, key)).trim();
}

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** Sorts by the given column; records missing that value always come last, ties fall back to name. */
export function sortAlumni(rows: AlumniRecord[], { key, direction }: AlumniSort): AlumniRecord[] {
  const sign = direction === 'asc' ? 1 : -1;
  const valueOf = (r: AlumniRecord): string | number | null => {
    if (key === 'graduationYear') return graduationYear(r);
    return sortText(r, key) || null;
  };
  return rows
    .map((record) => ({ record, value: valueOf(record) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value !== b.value) return a.value === null ? 1 : -1;
      } else {
        const c =
          typeof a.value === 'number' && typeof b.value === 'number'
            ? a.value - b.value
            : compareText(String(a.value), String(b.value));
        if (c !== 0) return c * sign;
      }
      return compareText(alumniField(a.record, 'name'), alumniField(b.record, 'name'));
    })
    .map(({ record }) => record);
}
