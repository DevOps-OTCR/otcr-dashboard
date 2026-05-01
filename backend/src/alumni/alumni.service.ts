import * as fs from 'fs';
import * as path from 'path';

import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AlumniService {
  constructor(private readonly config: ConfigService) {}

  getDatasetRaw(): Record<string, unknown> {
    const configured = this.config.get<string>('ALUMNI_DATA_PATH')?.trim();
    const fallback = path.join(process.cwd(), 'data', 'alumni.json');
    const filePath = configured || fallback;

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(
        'Alumni dataset file is missing. Set ALUMNI_DATA_PATH or place alumni.json under backend/data/.',
      );
    }

    try {
      const text = fs.readFileSync(filePath, 'utf8');
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ServiceUnavailableException('Alumni dataset JSON has an unexpected shape.');
      }
      const payload = parsed as { rows?: unknown };
      if (!Array.isArray(payload.rows)) {
        throw new ServiceUnavailableException('Alumni dataset JSON has an unexpected shape.');
      }
      return parsed as Record<string, unknown>;
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      throw new ServiceUnavailableException('Alumni dataset file could not be read.');
    }
  }
}
