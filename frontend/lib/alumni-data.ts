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
