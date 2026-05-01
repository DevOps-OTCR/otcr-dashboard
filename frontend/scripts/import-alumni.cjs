/**
 * Imports OTCR Alumni .xlsb into backend/data/alumni.json (private; served via GET /alumni API).
 *
 * Usage:
 *   node scripts/import-alumni.cjs [path-to.xlsb]
 *   ALUMNI_XLSB=/path/to/file.xlsb ALUMNI_JSON_OUT=/custom/out.json node scripts/import-alumni.cjs
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SOURCE =
  process.env.ALUMNI_XLSB ||
  process.argv[2] ||
  path.join(process.env.HOME || '', 'Downloads/OTCR_Alumni_Database (FA2025 Updated).xlsb');

const DEST =
  (process.env.ALUMNI_JSON_OUT && path.resolve(process.env.ALUMNI_JSON_OUT)) ||
  path.join(__dirname, '../../backend/data/alumni.json');

function cell(row, idx) {
  const v = row[idx];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Source file not found:', SOURCE);
    console.error('Pass path as first argument or set ALUMNI_XLSB.');
    process.exit(1);
  }

  const wb = XLSX.readFile(SOURCE, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Row 3 (1-based row 4) contains column titles; data begins next row (see workbook layout).
  const HEADER_ROW = 3;
  const header = matrix[HEADER_ROW] || [];

  /** @type {{ id: number; fields: Record<string, string> }[]} */
  const records = [];

  const keyFromHeader = (h) => {
    const base = String(h || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
    return base || null;
  };

  const used = new Map();
  const headerKeys = header.map((h, i) => {
    let k = keyFromHeader(h);
    if (!k) k = `col_${i}`;
    const n = (used.get(k) || 0) + 1;
    used.set(k, n);
    if (n > 1) k = `${k}_${n}`;
    return k;
  });

  /** Positional fallbacks match "Firmwide Set" export (Reachout×3 → Name … Notes). */
  const NAME_COL = header.findIndex((h) => String(h).trim().toLowerCase() === 'name');
  const EMPLOYER_COL = header.findIndex((h) => String(h).trim().toLowerCase() === 'current employer');
  const TITLE_COL = header.findIndex((h) => String(h).trim().toLowerCase() === 'current job title');

  let id = 0;
  for (let r = HEADER_ROW + 1; r < matrix.length; r += 1) {
    const row = matrix[r];
    if (!row || !row.length) continue;

    const rawFields = {};
    for (let c = 0; c < headerKeys.length; c += 1) {
      const k = headerKeys[c] || `col_${c}`;
      rawFields[k] = cell(row, c);
    }

    const nameGuess = NAME_COL >= 0 ? cell(row, NAME_COL) : '';
    const employerGuess = EMPLOYER_COL >= 0 ? cell(row, EMPLOYER_COL) : '';
    const titleGuess = TITLE_COL >= 0 ? cell(row, TITLE_COL) : '';

    const rawName = String(rawFields.name || nameGuess || '').trim();
    const employerVal = String(rawFields.currentemployer || employerGuess || '').trim();
    const titleVal = String(rawFields.currentjobtitle || titleGuess || '').trim();

    if (!rawName && !employerVal && !titleVal) continue;

    /** @type {Record<string, string>} */
    const fields = {};
    for (const [k, v] of Object.entries(rawFields)) {
      if (v !== '') fields[k] = v;
    }

    fields.name = rawName || '—';
    fields.currentemployer = employerVal;
    fields.currentjobtitle = titleVal;

    records.push({ id: id++, fields });
  }

  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(SOURCE),
    sheet: sheetName,
    headerRow: header.filter((h) => String(h).trim()),
    rows: records,
  };

  fs.writeFileSync(DEST, `${JSON.stringify(payload, null, 0)}\n`, 'utf8');
  console.log('Wrote', records.length, 'records to', DEST);
}

main();
