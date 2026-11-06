import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { getVerifiedUser } from '../../common/utils/verify';
import { PrismaService } from '../../prisma/prisma.service';
import { AgenticCmsModule } from '../agentic-cms.module';
import { McpServerService } from './mcp-server.service';
import { CmsReadService } from '../reads/cms-read.service';
import * as schemas from '../reads/read.schemas';

jest.mock('../../common/utils/verify', () => ({ getVerifiedUser: jest.fn() }));
const verify = jest.mocked(getVerifiedUser);
const databaseUrl = process.env.CMS_READ_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('MCP client -> Nest endpoint -> migrated PostgreSQL', () => {
  const schema = `cms_mcp_test_${randomUUID().replace(/-/g, '')}`;
  let pool: Pool;
  let db: PrismaClient;
  let app: INestApplication;
  let endpoint: string;
  let settings: Record<string, string>;
  const clients: Client[] = [];
  const timestamp = new Date('2026-11-05T12:00:00Z');

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) {
      throw new Error('CMS_READ_TEST_DATABASE_URL must point to local PostgreSQL.');
    }
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const migrations = join(__dirname, '../../../prisma/migrations');
    for (const name of readdirSync(migrations).filter(name => /^\d/.test(name)).sort()) {
      await pool.query(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'));
    }
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    for (const [id, role] of [['pm', 'PM'], ['reader', 'CONSULTANT'], ['outsider', 'CONSULTANT']] as const) {
      await db.user.create({ data: { id, email: `${id}@illinois.edu`, role, firstName: id, lastName: 'Demo' } });
      await db.allowedEmail.create({ data: { email: `${id}@illinois.edu`, role, active: true } });
    }
    await db.project.createMany({ data: ['project', 'other'].map(id => ({ id, name: id, pmId: 'pm', startDate: timestamp })) });
    await db.projectMember.create({ data: { userId: 'reader', projectId: 'project' } });
    await db.sprint.createMany({ data: [
      { id: 'week', projectId: 'project', label: 'Week 1', sequenceNumber: 1, status: 'RELEASED' },
      { id: 'draft', projectId: 'project', label: 'Draft', sequenceNumber: 2, status: 'DRAFT' },
      { id: 'other-week', projectId: 'other', label: 'Other', sequenceNumber: 1, status: 'RELEASED' },
    ].map(row => ({ ...row, status: row.status as 'RELEASED' | 'DRAFT',
      weekStartDate: new Date('2026-11-02T00:00:00Z'), weekEndDate: new Date('2026-11-08T00:00:00Z'),
      configSnapshot: { generalNotes: 'Compare market segments.' } })) });
    await db.deliverable.createMany({ data: [
      { id: 'd1', projectId: 'project', sprintId: 'week', title: 'Market landscape' },
      { id: 'd2', projectId: 'project', sprintId: 'week', title: 'Competitor analysis' },
      { id: 'hidden', projectId: 'project', sprintId: 'draft', title: 'Private draft' },
      { id: 'other-item', projectId: 'other', sprintId: 'other-week', title: 'Other project item' },
    ].map(row => ({ ...row, type: 'ANALYSIS' as const, deadline: new Date('2026-11-07T05:59:00Z'),
      status: 'IN_PROGRESS' as const, description: 'Use cited public evidence.' })) });
    await db.deliverableAssignment.create({ data: { deliverableId: 'd1', userId: 'reader' } });
    await db.deliverableSubtask.create({ data: { id: 'subtask', deliverableId: 'd1', title: 'Check citations', assigneeId: 'reader' } });
    await db.submission.create({ data: { id: 'revision-1', deliverableId: 'd1', userId: 'reader',
      fileUrl: 'https://example.test/draft-1', fileName: 'Draft 1', fileSize: 0, version: 1,
      status: 'REQUIRES_RESUBMISSION', feedback: 'Add source citations.', submittedAt: timestamp } });
    await db.submission.create({ data: { id: 'revision-2', deliverableId: 'd1', userId: 'reader',
      fileUrl: 'https://example.test/draft-2', fileName: 'Draft 2', fileSize: 0, version: 2,
      replacesId: 'revision-1', submittedAt: new Date('2026-11-06T12:00:00Z') } });

    const module = await Test.createTestingModule({ imports: [AgenticCmsModule] })
      .overrideProvider(PrismaService).useValue(db)
      .useMocker(token => token === ConfigService ? { get: (key: string) => settings[key] } : undefined)
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    endpoint = `${await app.getUrl()}/agentic-cms/mcp`;
  }, 30000);

  beforeEach(() => {
    settings = { AGENTIC_CMS_ENABLED: 'true', AGENTIC_CMS_ALLOWED_EMAILS: 'reader@illinois.edu,pm@illinois.edu,outsider@illinois.edu' };
    verify.mockReset();
    verify.mockImplementation(async token => {
      const id = { 'token-reader': 'reader', 'token-pm': 'pm', 'token-outsider': 'outsider' }[token];
      if (!id) throw new Error('Invalid synthetic token');
      return `${id}@illinois.edu`;
    });
  });
  afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.close()));
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });

  async function connect(identity = 'reader', modern = true) {
    const client = new Client({ name: 'otcr-cms-test', version: '1.0.0' }, {
      versionNegotiation: { mode: modern ? { pin: '2026-07-28' } : 'legacy' },
    });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer token-${identity}` } },
    }));
    return client;
  }
  async function call(client: Client, name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    const text = result.content.find(item => item.type === 'text');
    if (!text || text.type !== 'text') throw new Error('Missing text representation');
    expect(JSON.parse(text.text)).toEqual(result.structuredContent);
    return result.structuredContent;
  }

  it('discovers exactly four read-only tools with input and output schemas', async () => {
    const client = await connect();
    const result = await client.listTools();
    expect(result.tools.map(tool => tool.name).sort()).toEqual(['get_deliverable', 'get_workstream', 'list_deliverables', 'list_workstreams']);
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(tool.inputSchema.properties).toMatchObject({ projectId: { description: expect.stringContaining('selected project') } });
    }
    expect(result.tools.find(tool => tool.name === 'get_workstream').description).toContain('list_workstreams');
    expect(result.tools.find(tool => tool.name === 'get_deliverable').description).toContain('deliverableId');
  });

  it('also accepts the legacy initialize handshake through stateless HTTP', async () => {
    const client = await connect('reader', false);
    expect((await client.listTools()).tools).toHaveLength(4);
    const output = schemas.getDeliverableOutput.parse(await call(client, 'get_deliverable', { projectId: 'project', deliverableId: 'd1' }));
    expect(output.deliverableId).toBe('d1');
  });

  it('calls all four tools over HTTP and receives the exact expected CMS records', async () => {
    const client = await connect();
    const workstreams = schemas.listWorkstreamsOutput.parse(await call(client, 'list_workstreams', {
      projectId: 'project', currentOnly: true, asOf: '2026-11-06T12:00:00Z',
    }));
    expect(workstreams.workstreams.items.map(item => item.id)).toEqual(['week']);
    expect(workstreams.workstreams.items[0].generalNotesPreview).toBe('Compare market segments.');
    const workstream = schemas.getWorkstreamOutput.parse(await call(client, 'get_workstream', { projectId: 'project', workstreamId: 'week' }));
    expect(workstream.workstream.generalNotes).toBe('Compare market segments.');
    expect(workstream.deliverables.items.map(item => item.id)).toEqual(['d1', 'd2']);
    expect(workstream.deliverables.items[0].descriptionPreview).toBe('Use cited public evidence.');
    const list = schemas.listDeliverablesOutput.parse(await call(client, 'list_deliverables', {
      projectId: 'project', workstreamId: 'week', status: 'IN_PROGRESS', limit: 1,
    }));
    expect(list.deliverables.items[0]).toMatchObject({ id: 'd1', title: 'Market landscape', deadline: '2026-11-07T05:59:00.000Z', descriptionPreview: 'Use cited public evidence.' });
    const next = schemas.listDeliverablesOutput.parse(await call(client, 'list_deliverables', {
      projectId: 'project', workstreamId: 'week', status: 'IN_PROGRESS', limit: 1, cursor: list.deliverables.nextCursor,
    }));
    expect(next.deliverables.items.map(item => item.id)).toEqual(['d2']);
    expect(next.deliverables.nextCursor).toBeNull();
    const detail = schemas.getDeliverableOutput.parse(await call(client, 'get_deliverable', { projectId: 'project', deliverableId: 'd1' }));
    if (detail.section !== 'overview') throw new Error('Wrong section');
    expect(detail.deliverable.description).toBe('Use cited public evidence.');
    for (const section of ['assignments', 'subtasks'] as const) {
      const output = schemas.getDeliverableOutput.parse(await call(client, 'get_deliverable', { projectId: 'project', deliverableId: 'd1', section }));
      expect(output[section].items).toHaveLength(1);
    }
    const history = schemas.getDeliverableOutput.parse(await call(client, 'get_deliverable', { projectId: 'project', deliverableId: 'd1', section: 'submissions' }));
    if (history.section !== 'submissions') throw new Error('Wrong section');
    expect(history.submissions.items.map(item => [item.id, item.version, item.replacesId, item.feedback])).toEqual([
      ['revision-2', 2, 'revision-1', null], ['revision-1', 1, null, 'Add source citations.'],
    ]);
  });

  it('isolates concurrent users and denies draft/cross-project access without leaking records', async () => {
    const [reader, outsider, pm] = await Promise.all([connect(), connect('outsider'), connect('pm')]);
    const [allowed, denied, manager] = await Promise.all([
      reader.callTool({ name: 'get_deliverable', arguments: { projectId: 'project', deliverableId: 'd1' } }),
      outsider.callTool({ name: 'get_deliverable', arguments: { projectId: 'project', deliverableId: 'd1' } }),
      pm.callTool({ name: 'get_deliverable', arguments: { projectId: 'project', deliverableId: 'hidden' } }),
    ]);
    expect(allowed.isError).not.toBe(true);
    expect(manager.isError).not.toBe(true);
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied)).not.toContain('Market landscape');
    for (const args of [{ projectId: 'project', deliverableId: 'hidden' }, { projectId: 'project', deliverableId: 'other-item' }]) {
      const result = await reader.callTool({ name: 'get_deliverable', arguments: args });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ code: 'NOT_FOUND_OR_FORBIDDEN', message: 'The requested CMS record is unavailable.' }) }]);
    }
  });

  it('denies invalid arguments, unknown tools and modified cursors', async () => {
    const client = await connect();
    for (const args of [{ projectId: 'project', userId: 'pm' }, { projectId: 'project', limit: 51 }]) {
      const result = client.callTool({ name: 'list_deliverables', arguments: args });
      // SDK versions may report validation as a protocol error or a tool error.
      const outcome = await result.catch(() => ({ isError: true }));
      expect(outcome.isError).toBe(true);
    }
    const unknown = await client.callTool({ name: 'delete_project', arguments: { projectId: 'project' } }).catch(() => ({ isError: true }));
    expect(unknown.isError).toBe(true);
    const invalid = await client.callTool({ name: 'list_deliverables', arguments: { projectId: 'project', cursor: 'modified' } });
    expect(invalid.isError).toBe(true);
  });

  it('rechecks membership, flag and pilot admission on an already connected client', async () => {
    const client = await connect();
    await db.projectMember.update({ where: { projectId_userId: { projectId: 'project', userId: 'reader' } }, data: { leftAt: new Date() } });
    try {
      const denied = await client.callTool({ name: 'list_deliverables', arguments: { projectId: 'project' } });
      expect(denied.isError).toBe(true);
    } finally {
      await db.projectMember.update({ where: { projectId_userId: { projectId: 'project', userId: 'reader' } }, data: { leftAt: null } });
    }
    settings.AGENTIC_CMS_ALLOWED_EMAILS = 'pm@illinois.edu';
    await expect(client.callTool({ name: 'list_workstreams', arguments: { projectId: 'project' } })).rejects.toThrow();
    settings.AGENTIC_CMS_ALLOWED_EMAILS = '';
    settings.AGENTIC_CMS_ENABLED = 'false';
    const query = jest.spyOn(db.project, 'findUnique');
    verify.mockClear();
    await expect(client.callTool({ name: 'list_workstreams', arguments: { projectId: 'project' } })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('sanitizes tool failures and withholds a result if the feature is disabled mid-call', async () => {
    const client = await connect();
    const reads = app.get(CmsReadService);
    const original = reads.listDeliverables.bind(reads);
    const method = jest.spyOn(reads, 'listDeliverables');
    method.mockRejectedValueOnce(new Error('Database credentials and client materials'));
    const failed = await client.callTool({ name: 'list_deliverables', arguments: { projectId: 'project' } });
    expect(failed.isError).toBe(true);
    expect(failed.content).toEqual([{ type: 'text', text: JSON.stringify({ code: 'CMS_UNAVAILABLE', message: 'CMS data is temporarily unavailable.' }) }]);
    method.mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      settings.AGENTIC_CMS_ENABLED = 'false';
      return result;
    });
    const revoked = await client.callTool({ name: 'list_deliverables', arguments: { projectId: 'project' } });
    expect(revoked.isError).toBe(true);
    expect(JSON.stringify(revoked)).not.toContain('Market landscape');
  });

  it.each([undefined, 'false', 'TRUE'])('keeps endpoint construction and reads off for flag %s', async value => {
    settings.AGENTIC_CMS_ENABLED = value;
    const handler = jest.spyOn(app.get(McpServerService), 'handle');
    const query = jest.spyOn(db.project, 'findUnique');
    expect((await fetch(endpoint, { method: 'POST', headers: { Authorization: 'Bearer token-reader', 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer reader@illinois.edu', 'Bearer expired-token'])('rejects credentials %s before tool dispatch', async authorization => {
    const query = jest.spyOn(db.project, 'findUnique');
    expect((await fetch(endpoint, { method: 'POST', headers: { ...(authorization ? { authorization } : {}), 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects disallowed origins/hosts and unsupported HTTP methods', async () => {
    const headers = { Authorization: 'Bearer token-reader', 'Content-Type': 'application/json' };
    expect((await fetch(endpoint, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body: '{}' })).status).toBe(403);
    // fetch controls its own Host header; use node:http to exercise rebinding protection.
    const hostStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(endpoint, { method: 'POST', headers: { ...headers, Host: 'untrusted.example', 'Content-Length': '2' } }, response => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on('error', reject);
      request.end('{}');
    });
    expect(hostStatus).toBe(403);
    for (const method of ['GET', 'DELETE', 'PUT']) {
      const result = await fetch(endpoint, { method, headers });
      expect(result.status).toBe(405);
      expect(result.headers.get('allow')).toBe('POST');
      expect(result.headers.get('cache-control')).toBe('no-store');
    }
    const legacy = await fetch(endpoint, { method: 'POST', headers: { ...headers, Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
    expect(legacy.status).toBe(200);
    expect(legacy.headers.get('cache-control')).toBe('no-store');
    await legacy.text();
  });
});
