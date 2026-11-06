import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as z from 'zod';

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException({ code: 'INVALID_ARGUMENT', message: 'Invalid read operation arguments.' });
  return result.data;
}

export function unavailable(): never {
  throw new NotFoundException({ code: 'NOT_FOUND_OR_FORBIDDEN', message: 'The requested CMS record is unavailable.' });
}

export function userReference(user: { id: string; firstName: string | null; lastName: string | null } | null) {
  return user ? { id: user.id, displayName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null } : null;
}

export function finish<T extends z.ZodType>(schema: T, output: Record<string, unknown>): z.output<T> {
  const truncatedFields: string[] = [];
  function serialize(value: unknown, path: string): unknown {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') {
      const points = Array.from(value);
      const limit = /\/(generalNotesPreview|descriptionPreview)$/.test(path) ? 600 : 12000;
      if (points.length > limit) {
        truncatedFields.push(path);
        return points.slice(0, limit).join('');
      }
    }
    if (Array.isArray(value)) return value.map((item, index) => serialize(item, `${path}/${index}`));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, serialize(item, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`)],
    ));
    return value;
  }
  const data = serialize(output, '') as Record<string, unknown>;
  return schema.parse({ ...data, schemaVersion: '1', retrievedAt: new Date().toISOString(), truncatedFields });
}
