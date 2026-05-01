import * as fs from 'fs';
import * as path from 'path';

/**
 * If ALUMNI_B64 is set, decode base64 to backend/data/alumni.json before the app serves /alumni.
 * Use a start command that does NOT expand this var on the shell command line (e.g. only `npm run start:prod`).
 */
export function materializeAlumniFromEnv(): void {
  const b64 = process.env.ALUMNI_B64?.trim();
  if (!b64) return;

  let decoded: Buffer;
  try {
    decoded = Buffer.from(b64, 'base64');
  } catch {
    throw new Error('ALUMNI_B64 is set but could not be decoded as base64.');
  }
  if (!decoded.length) {
    throw new Error('ALUMNI_B64 decoded to an empty file.');
  }

  const dest = path.join(process.cwd(), 'data', 'alumni.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, decoded);

  delete process.env.ALUMNI_B64;
}
