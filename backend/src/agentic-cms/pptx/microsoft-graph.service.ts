import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DriveItemRef, UploadResult } from './pptx.types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

function requestSignal(signal?: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
}

async function boundedBody(response: Response): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) {
    await response.body?.cancel();
    throw new GraphError('UNKNOWN', 'The file exceeds the 25 MB review limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new GraphError('UNKNOWN', 'The file response was empty.');
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_DOWNLOAD_BYTES) throw new GraphError('UNKNOWN', 'The file exceeds the 25 MB review limit.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks, bytes);
}

type GraphErrorCode =
  | 'NOT_CONFIGURED'
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT_ETAG'
  | 'LOCKED'
  | 'UNKNOWN';

export class GraphError extends Error {
  constructor(
    readonly code: GraphErrorCode,
    readonly userMessage: string,
    readonly httpStatus?: number,
  ) {
    super(userMessage);
  }
}

@Injectable()
export class MicrosoftGraphService {
  private readonly log = new Logger(MicrosoftGraphService.name);
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('MSGRAPH_CLIENT_ID') &&
        this.config.get<string>('MSGRAPH_TENANT_ID') &&
        (this.config.get<string>('MSGRAPH_CLIENT_SECRET') || this.config.get<string>('MSGRAPH_REFRESH_TOKEN')),
    );
  }

  /** Returns true when using delegated (refresh token) auth rather than client credentials. */
  private isDelegated(): boolean {
    return Boolean(this.config.get<string>('MSGRAPH_REFRESH_TOKEN'));
  }

  async resolveLink(url: string, signal?: AbortSignal): Promise<DriveItemRef> {
    if (!this.isConfigured()) throw new GraphError('NOT_CONFIGURED', 'Microsoft Graph is not configured — set MSGRAPH_CLIENT_ID, MSGRAPH_TENANT_ID and MSGRAPH_CLIENT_SECRET.');

    let link: URL;
    try { link = new URL(url); } catch { throw new GraphError('NOT_FOUND', 'Use a OneDrive or SharePoint submission link.'); }
    if (link.protocol !== 'https:' || link.username || link.password || link.port ||
        !(['1drv.ms', 'onedrive.live.com'].includes(link.hostname) ||
          link.hostname.endsWith('.sharepoint.com'))) {
      throw new GraphError('NOT_FOUND', 'Only HTTPS OneDrive or SharePoint submission links are supported.');
    }
    const encoded = this.encodeShareUrl(url);
    const item = await this.graphJson<{ id?: string; parentReference?: { driveId?: string }; eTag?: string }>(
      `${GRAPH_BASE}/shares/${encoded}/driveItem?$select=id,parentReference,eTag`, signal,
    );
    if (!item.id || !item.parentReference?.driveId || !item.eTag || item.eTag === '*') {
      throw new GraphError('UNKNOWN', 'Graph returned an incomplete file reference.');
    }
    return { itemId: item.id, driveId: item.parentReference.driveId, eTag: item.eTag, directDownload: false };
  }

  async downloadPptx(ref: DriveItemRef, signal?: AbortSignal): Promise<Buffer> {
    if (ref.directDownload) throw new GraphError('NOT_FOUND', 'Direct download links are unsupported.');
    return this.downloadBuffer(`${GRAPH_BASE}/drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.itemId)}/content`, signal);
  }

  async downloadAsPdf(ref: DriveItemRef, signal?: AbortSignal): Promise<Buffer> {
    if (ref.directDownload) {
      throw new GraphError('NOT_FOUND', 'PDF conversion is not available for direct-download links — use a OneDrive share link.');
    }
    return this.downloadBuffer(`${GRAPH_BASE}/drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.itemId)}/content?format=pdf`, signal);
  }

  async uploadPptx(ref: DriveItemRef, content: Buffer, ifMatchEtag: string, signal?: AbortSignal): Promise<UploadResult> {
    if (ref.directDownload || !ifMatchEtag || ifMatchEtag === '*' || ifMatchEtag !== ref.eTag || /[\r\n]/.test(ifMatchEtag)) return { status: 412 };

    const token = await this.getAccessToken();
    const url = `${GRAPH_BASE}/drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.itemId)}/content`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'If-Match': ifMatchEtag,
      },
      body: content as unknown as BodyInit,
      signal: requestSignal(signal),
      redirect: 'error',
    });

    if (res.status === 412) return { status: 412 };
    if (res.status === 423) return { status: 423 };
    if (!res.ok) {
      this.log.warn(`PPTX upload failed HTTP ${res.status}`);
      return { status: res.status };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = await res.json().catch(() => ({})) as any;
    return { status: res.status, newEtag: item.eTag ?? '' };
  }

  private encodeShareUrl(url: string): string {
    const b64 = Buffer.from(url).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `u!${b64}`;
  }

  private async downloadBuffer(url: string, signal?: AbortSignal): Promise<Buffer> {
    const token = await this.getAccessToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow',
      signal: requestSignal(signal),
    });
    if (res.status === 401) throw new GraphError('AUTH_FAILED', 'Sign in again — Graph token was rejected.', 401);
    if (res.status === 403) throw new GraphError('FORBIDDEN', 'No access to this file. Ask the owner to share it with the OTCR Bot service account.', 403);
    if (res.status === 404) throw new GraphError('NOT_FOUND', 'File not found or not shared with the agent.', 404);
    if (!res.ok) throw new GraphError('UNKNOWN', `Unexpected Graph API error (HTTP ${res.status}).`, res.status);
    return boundedBody(res);
  }

  private async graphJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: requestSignal(signal), redirect: 'error' });
    if (res.status === 401) throw new GraphError('AUTH_FAILED', 'Sign in again — Graph token was rejected.', 401);
    if (res.status === 403) throw new GraphError('FORBIDDEN', 'No access to this file.', 403);
    if (res.status === 404 || res.status === 400) throw new GraphError('NOT_FOUND', 'File not found or not shared with the agent.', res.status);
    if (!res.ok) {
      throw new GraphError('UNKNOWN', `Graph API request failed (HTTP ${res.status}).`, res.status);
    }
    return res.json() as Promise<T>;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.token;
    }

    const clientId = this.config.get<string>('MSGRAPH_CLIENT_ID');
    const tenantId = this.config.get<string>('MSGRAPH_TENANT_ID');

    if (!clientId || !tenantId) {
      throw new GraphError('NOT_CONFIGURED', 'Microsoft Graph credentials are not configured — set MSGRAPH_CLIENT_ID and MSGRAPH_TENANT_ID.');
    }

    return this.isDelegated()
      ? this.getTokenViaRefreshToken(clientId, tenantId, now)
      : this.getTokenViaClientCredentials(clientId, tenantId, now);
  }

  private async getTokenViaRefreshToken(clientId: string, tenantId: string, now: number): Promise<string> {
    const refreshToken = this.config.get<string>('MSGRAPH_REFRESH_TOKEN')!;
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      signal: requestSignal(),
      redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
        scope: 'https://graph.microsoft.com/Files.ReadWrite offline_access',
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (body.includes('AADSTS70008') || body.includes('expired')) {
        throw new GraphError('AUTH_FAILED', 'Graph refresh token has expired. Run the sign-in script again to get a new MSGRAPH_REFRESH_TOKEN.');
      }
      throw new GraphError('AUTH_FAILED', `Graph token refresh failed (${res.status}). Check MSGRAPH_REFRESH_TOKEN.`);
    }
    const data = await res.json() as { access_token: string; expires_in?: number; refresh_token?: string };
    this.tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
    return data.access_token;
  }

  private async getTokenViaClientCredentials(clientId: string, tenantId: string, now: number): Promise<string> {
    const clientSecret = this.config.get<string>('MSGRAPH_CLIENT_SECRET');
    if (!clientSecret) throw new GraphError('NOT_CONFIGURED', 'Set either MSGRAPH_CLIENT_SECRET (app auth) or MSGRAPH_REFRESH_TOKEN (delegated auth).');
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      signal: requestSignal(),
      redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (body.includes('AADSTS65001')) throw new GraphError('AUTH_FAILED', 'Admin must approve the OTCR Bot app in Entra before it can access files.');
      throw new GraphError('AUTH_FAILED', `Graph authentication failed (${res.status}). Check MSGRAPH_CLIENT_SECRET.`);
    }
    const data = await res.json() as { access_token: string; expires_in?: number };
    this.tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
    return data.access_token;
  }
}
