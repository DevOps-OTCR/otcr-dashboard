import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GoogleDocument } from './google-doc';

// Same service-account JWT pattern as integrations/google-calendar.service.ts, with
// separate credentials so Docs access can be granted and revoked on its own.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require('jsonwebtoken');

export const DOCS_SCOPE = 'https://www.googleapis.com/auth/documents';
const API = 'https://docs.googleapis.com/v1/documents';

// uncertain: Google answered 200 (it applied the insert) but did not confirm the comment saved, so it may exist.
export type GoogleDocsErrorReason = 'not_configured' | 'auth' | 'no_access' | 'forbidden' | 'revision_mismatch' | 'bad_request' | 'unavailable' | 'uncertain';

/** `detail` is Google's message: fine for the local spike output, never returned to MCP clients. */
export class GoogleDocsError extends Error {
  constructor(readonly reason: GoogleDocsErrorReason, readonly status: number, readonly detail: string) {
    super(`Google Docs ${reason} (${status})`);
  }
}

export interface InsertCommentResult {
  commentId: string | null;
  /** Text Google actually anchored the comment to (its own read-back). */
  anchoredText: string | null;
  /** Every comment creates a new document revision; use this for the next guarded write. */
  nextRevisionId: string | null;
  /** Raw batchUpdate reply, kept for the spike. */
  raw: unknown;
}

@Injectable()
export class GoogleDocsClient {
  private token: { value: string; expiresAt: number } | null = null;
  /** OAuth scope requested. The spike overrides it to find the minimum that works. */
  scope = DOCS_SCOPE;

  constructor(private readonly config: ConfigService) {}

  /** The address documents must be shared with. */
  serviceAccountEmail(): string | null {
    return this.config.get<string>('GOOGLE_DOCS_CLIENT_EMAIL')?.trim() || null;
  }

  isConfigured(): boolean {
    return Boolean(this.serviceAccountEmail() && this.config.get<string>('GOOGLE_DOCS_PRIVATE_KEY'));
  }

  getDocument(documentId: string, signal?: AbortSignal): Promise<GoogleDocument> {
    return this.request(`${API}/${encodeURIComponent(documentId)}?includeTabsContent=true`, { method: 'GET', signal });
  }

  async insertComment(
    documentId: string,
    comment: { content: string; startIndex: number; endIndex: number; tabId: string | null },
    requiredRevisionId: string | null,
    signal?: AbortSignal,
  ): Promise<InsertCommentResult> {
    const range: Record<string, unknown> = { startIndex: comment.startIndex, endIndex: comment.endIndex };
    if (comment.tabId) range.tabId = comment.tabId;
    const body: Record<string, unknown> = { requests: [{ insertComment: { content: comment.content, range } }] };
    if (requiredRevisionId) body.writeControl = { requiredRevisionId };
    // Shape confirmed by the spike (2026-11-13).
    type Response = {
      replies?: { insertComment?: { commentThread?: { commentId?: string; plainTextQuote?: string } } }[];
      writeControl?: { requiredRevisionId?: string };
      commentUpdateState?: string;
    };
    const raw = await this.request<Response>(
      `${API}/${encodeURIComponent(documentId)}:batchUpdate`,
      { method: 'POST', body: JSON.stringify(body), signal },
    );
    if (raw.commentUpdateState && raw.commentUpdateState !== 'ALL_SAVED') {
      throw new GoogleDocsError('uncertain', 200, `Comment not confirmed saved: ${raw.commentUpdateState}`);
    }
    const thread = raw.replies?.[0]?.insertComment?.commentThread;
    return {
      commentId: thread?.commentId ?? null,
      anchoredText: thread?.plainTextQuote ?? null,
      nextRevisionId: raw.writeControl?.requiredRevisionId ?? null,
      raw,
    };
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
    });
    if (response.ok) return response.json() as Promise<T>;
    const detail = await response.text().catch(() => '');
    throw new GoogleDocsError(this.reasonFor(response.status, detail), response.status, detail.slice(0, 2000));
  }

  private reasonFor(status: number, detail: string): GoogleDocsErrorReason {
    if (status === 401) return 'auth';
    if (status === 404) return 'no_access'; // Google answers 404 for docs the account cannot see.
    if (status === 403) {
      if (/insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(detail)) return 'auth';
      // Some Google APIs report quota as 403. That is "try later", not "share the document".
      if (/rateLimitExceeded|RATE_LIMIT_EXCEEDED|quota/i.test(detail)) return 'unavailable';
      return 'forbidden';
    }
    if (status === 400 && /revision/i.test(detail)) return 'revision_mismatch';
    if (status === 400) return 'bad_request';
    return 'unavailable';
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 60_000) return this.token.value;
    const email = this.serviceAccountEmail();
    const key = this.config.get<string>('GOOGLE_DOCS_PRIVATE_KEY');
    if (!email || !key) throw new GoogleDocsError('not_configured', 0, 'GOOGLE_DOCS_CLIENT_EMAIL / GOOGLE_DOCS_PRIVATE_KEY missing');
    const iat = Math.floor(now / 1000);
    const assertion = jwt.sign(
      { iss: email, scope: this.scope, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 },
      key.replace(/\\n/g, '\n'),
      { algorithm: 'RS256' },
    );
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!response.ok) throw new GoogleDocsError('auth', response.status, (await response.text().catch(() => '')).slice(0, 2000));
    const data = (await response.json()) as { access_token: string; expires_in?: number };
    this.token = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
    return data.access_token;
  }
}
