import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import * as z from 'zod';

const payloadSchema = z.strictObject({
  scope: z.string(), id: z.string().min(1).max(200),
  sortValue: z.union([z.string().max(200), z.number().int(), z.null()]),
  asOf: z.iso.datetime().nullable(),
});
export type ReadPosition = z.infer<typeof payloadSchema>;

@Injectable()
export class ReadCursorService {
  // Process-local signing key: restarts/other backend instances require a fresh traversal.
  private readonly key = randomBytes(32);

  scope(binding: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(binding)).digest('hex');
  }

  invalid(): never {
    throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Start a new traversal without a cursor.' });
  }

  encode(scope: string, position: Omit<ReadPosition, 'scope'>): string {
    const data = Buffer.from(JSON.stringify({ scope, ...position })).toString('base64url');
    return `${data}.${createHmac('sha256', this.key).update(data).digest('base64url')}`;
  }

  decode(token: string | undefined, scope: string): ReadPosition | null {
    if (!token) return null;
    try {
      const [data, signature, extra] = token.split('.');
      if (!data || !signature || extra !== undefined) return this.invalid();
      const expected = createHmac('sha256', this.key).update(data).digest();
      const supplied = Buffer.from(signature, 'base64url');
      if (supplied.toString('base64url') !== signature || supplied.length !== expected.length
        || !timingSafeEqual(supplied, expected)) return this.invalid();
      const result = payloadSchema.parse(JSON.parse(Buffer.from(data, 'base64url').toString('utf8')));
      if (result.scope !== scope) return this.invalid();
      return result;
    } catch {
      return this.invalid();
    }
  }
}
