import * as fs from 'fs';
import * as path from 'path';

/**
 * Render Secret Files (and similar) mount raw file bytes under /etc/secrets/.
 * If that file exists, copy it to data/alumni.json so AlumniService can read it.
 * Paste the same JSON as local backend/data/alumni.json (from import-alumni.cjs), not base64.
 *
 * Override mount path: ALUMNI_SECRET_FILE=/etc/secrets/your_key_name
 */
export function materializeAlumniFromSecretFile(): void {
  const src = (process.env.ALUMNI_SECRET_FILE || '/etc/secrets/alumni.json').trim();
  if (!src || !fs.existsSync(src)) return;

  const dest = path.join(process.cwd(), 'data', 'alumni.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
