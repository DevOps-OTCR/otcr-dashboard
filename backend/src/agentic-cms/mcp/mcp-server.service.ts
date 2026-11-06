import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpServer, createMcpHandler, type CallToolResult, type StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { toNodeHandler, hostHeaderValidation, originValidation } from '@modelcontextprotocol/node';
import type { Request, Response } from 'express';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import type { CmsReader } from '../authorization/cms-read-access.service';
import { CmsReadService } from '../reads/cms-read.service';
import * as schemas from '../reads/read.schemas';

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const safeErrors: Record<string, string> = {
  NOT_FOUND_OR_FORBIDDEN: 'The requested CMS record is unavailable.',
  INVALID_ARGUMENT: 'Invalid read operation arguments.',
  INVALID_CURSOR: 'Start a new traversal without a cursor.',
  CMS_UNAVAILABLE: 'CMS data is temporarily unavailable.',
};

@Injectable()
export class McpServerService {
  constructor(
    private readonly reads: CmsReadService,
    private readonly flags: FeatureFlagsService,
    private readonly config: ConfigService,
  ) {}

  private async call(user: CmsReader, operation: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
    try {
      this.flags.assertAgenticCmsEnabledFor(user.email);
      const output = await operation();
      this.flags.assertAgenticCmsEnabledFor(user.email);
      return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : null;
      const code = response && typeof response === 'object' && 'code' in response
        && typeof response.code === 'string' && typeof safeErrors[response.code] === 'string'
        ? response.code : error instanceof HttpException && error.getStatus() === 404
          ? 'FEATURE_UNAVAILABLE' : 'CMS_UNAVAILABLE';
      const message = safeErrors[code] ?? 'Agentic CMS is unavailable.';
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code, message }) }] };
    }
  }

  private server(user: CmsReader): McpServer {
    this.flags.assertAgenticCmsEnabledFor(user.email);
    const server = new McpServer({ name: 'otcr-cms', version: '0.1.0' });
    const register = (
      name: string, description: string, inputSchema: StandardSchemaWithJSON, outputSchema: StandardSchemaWithJSON,
      operation: (input: unknown) => Promise<Record<string, unknown>>,
    ) => server.registerTool(name, { description, inputSchema, outputSchema, annotations },
      input => this.call(user, () => operation(input)));

    register('list_workstreams',
      'List visible weekly workstreams in a project. Set currentOnly to filter by project-local date; use returned IDs with get_workstream. Follow nextCursor for remaining results.',
      schemas.listWorkstreamsInput, schemas.listWorkstreamsOutput, input => this.reads.listWorkstreams(user, input));
    register('get_workstream',
      'Read one visible workstream, its general notes and a batch of deliverable summaries. Deliverables may be denied independently; get_deliverable provides details.',
      schemas.getWorkstreamInput, schemas.getWorkstreamOutput, input => this.reads.getWorkstream(user, input));
    register('list_deliverables',
      'List authorized project deliverables, optionally filtered by workstream and stored status. Follow nextCursor with the same filters; use get_deliverable for details.',
      schemas.listDeliverablesInput, schemas.listDeliverablesOutput, input => this.reads.listDeliverables(user, input));
    register('get_deliverable',
      'Read a deliverable overview, or choose section assignments, subtasks or submissions for a paginated collection. Submissions include CMS versions and stored feedback; linked file contents are not read.',
      schemas.getDeliverableInput, schemas.getDeliverableOutput, input => this.reads.getDeliverable(user, input));
    return server;
  }

  async handle(request: Request & { user: CmsReader }, response: Response): Promise<void> {
    this.flags.assertAgenticCmsEnabledFor(request.user?.email);
    response.setHeader('Cache-Control', 'no-store');
    // Local defaults protect against DNS rebinding. Render supplies its own hostname.
    const hosts = ['localhost', '127.0.0.1', '[::1]'];
    const renderHost = this.config.get<string>('RENDER_EXTERNAL_HOSTNAME');
    if (renderHost) hosts.push(renderHost);
    const origins = [...hosts];
    for (const value of [this.config.get<string>('FRONTEND_URL'), ...(this.config.get<string>('CORS_ORIGINS') ?? '').split(',')]) {
      if (!value?.trim()) continue;
      try { origins.push(new URL(value.trim()).hostname); } catch { /* Invalid origins remain denied. */ }
    }
    if (!hostHeaderValidation(hosts)(request, response) || !originValidation(origins)(request, response)) return;
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      response.status(405).json({ message: 'Method not allowed.' });
      return;
    }
    // A fresh handler closes over this request's verified identity. No shared
    // transport/session/user, startup listener, model call or subscription worker.
    const handler = createMcpHandler(() => this.server(request.user), {
      maxSubscriptions: 0,
    });
    try {
      await toNodeHandler({ fetch: async (httpRequest, options) => {
        const result = await handler.fetch(httpRequest, options);
        // Legacy SSE supplies its own cache header; keep CMS responses private.
        result.headers.set('Cache-Control', 'no-store');
        return result;
      } })(request, response, request.body);
    } finally {
      await handler.close();
    }
  }
}
