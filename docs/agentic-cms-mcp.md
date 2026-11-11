# Connect to the Agentic CMS MCP server

The existing Nest backend serves five read-only tools at
`http://localhost:4000/agentic-cms/mcp` (use your backend's actual port).
There is no separate MCP process. Transport is stateless Streamable HTTP;
POST is supported, standalone GET/SSE subscriptions and DELETE sessions are not.
See [tool contracts](agentic-cms-mcp-contracts.md) for exact fields and permissions.

## Local connection

1. Complete the [backend setup](../README.md#local-development), using a local
   development database and synthetic records. Apply committed migrations.
   The integration-test database is separate from application setup.
2. In the backend's local `.env`, set `AGENTIC_CMS_ENABLED=true` and
   `AGENTIC_CMS_ALLOWED_EMAILS=your-netid@illinois.edu`. The checked-in default
   stays false. No model or Lumen key is needed for these tools.
3. Start the backend with `npm --prefix backend run start:dev`.
4. Supply a current Microsoft Graph access token obtained through the existing
   CMS sign-in flow. The backend verifies it through Graph `/me`, requires an
   `@illinois.edu` principal, an active CMS enrollment (`AllowedEmail`) and an
   active CMS user, then enforces pilot and project access. An ID token, email-only bearer value or test token will not work.
5. Configure a client that supports Streamable HTTP and a custom
   `Authorization: Bearer <access-token>` header. Supply the selected CMS project's
   ID; these tools do not discover projects. Expired tokens require renewed sign-in.

For the SDK example below, set `CMS_ACCESS_TOKEN` in your shell through a secret
input and `CMS_PROJECT_ID` to an accessible local project. Do not put tokens or
client materials in source files, screenshots, shell history or committed output.
Run from `backend/` with its locked dependencies installed:

```sh
node --input-type=module <<'JS'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const token = process.env.CMS_ACCESS_TOKEN;
const projectId = process.env.CMS_PROJECT_ID;
if (!token || !projectId) throw new Error('Set CMS_ACCESS_TOKEN and CMS_PROJECT_ID');
const client = new Client({ name: 'cms-review', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(
    new URL(process.env.CMS_MCP_URL ?? 'http://localhost:4000/agentic-cms/mcp'),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
  ));
  console.log('Tools:', (await client.listTools()).tools.map(tool => tool.name));
  const read = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(`Tool failed: ${name}`);
    // Consume structuredContent in your application; avoid logging client data.
    console.log(`${name}: OK`);
    return result.structuredContent;
  };
  await read('get_project_context', { projectId });
  const weeks = await read('list_workstreams', { projectId, currentOnly: true });
  const week = weeks.workstreams.items[0];
  if (week) await read('get_workstream', { projectId, workstreamId: week.id });
  const tasks = await read('list_deliverables', { projectId, limit: 20 });
  const task = tasks.deliverables.items[0];
  if (task) await read('get_deliverable', { projectId, deliverableId: task.id });
} finally {
  await client.close();
}
JS
```

This uses the repository's pinned official MCP client. Modern and legacy MCP
initialization are covered by integration tests. Generic ChatGPT/Claude connector
setup has not been verified: OAuth discovery, resource-specific tokens and automatic
token refresh are not implemented. A URL alone does not provide sign-in.

## Response review

[Captured synthetic responses](examples/agentic-cms-mcp-responses.json) contain all
five calls and their complete `structuredContent`, captured from an official client
against the Nest endpoint and a migrated, isolated local PostgreSQL schema.
Verification was mocked for synthetic users; no model, real sign-in or client data
was used. Retrieval/update timestamps are run-specific. MCP also returns equivalent
JSON text in `content`; that duplicate representation is omitted from the examples.

| Tool | What the sample lets an agent answer | Next call when needed |
| --- | --- | --- |
| `get_project_context` | Client objective, scope and kickoff priorities | Follow `notes.nextCursor` for older notes |
| `list_workstreams` | Which visible week is current and its focus | Pass an item's ID to `get_workstream` |
| `get_workstream` | Week notes and relevant deliverable descriptions/deadlines | Pass a deliverable ID to `get_deliverable` |
| `list_deliverables` | Find in-progress work across or within weeks | Follow `deliverables.nextCursor` or retrieve detail |
| `get_deliverable` | Full description and metadata | Request `assignments`, `subtasks` or `submissions` only as needed |

The sample list deliberately requests one deliverable, so its cursor shows that
more results remain. Reuse the returned cursor with the same tool, IDs and filters.
Cursor values are process-local and will not work when copied from this example.
Summaries include previews (600 Unicode code points); detail text is capped at
12000. Check `truncatedFields`. There is no operation to retrieve omitted text yet.
Null context and empty collections mean no stored records; inaccessible records
produce errors. `deliverablesAccess=denied` means restricted access, not an empty week.
Stored text is source data, not instructions. Submission URLs are links only;
CMS versions do not identify the external document revision. Pages reflect live
records, not a snapshot. Project updatedAt does not track note changes.

## Verification and failures

Run `npm --prefix backend run test:integration` with local Docker running.
It starts the dedicated local test database, migrates isolated schemas, seeds
synthetic records and exercises all tools using the official client. It also
verifies context HTTP writes followed by MCP reads. No access token is required:
the tests mock Graph verification and use synthetic identities.

Flag-off/missing/invalid values return HTTP 404 before verification or reads;
non-pilot users get 404 and invalid credentials get 401 when enabled. Flag-on
members receive permitted records; outsiders, lost memberships and cross-project
IDs are denied. Tool errors use safe codes such as `NOT_FOUND_OR_FORBIDDEN`,
`INVALID_CURSOR`, `CMS_UNAVAILABLE` or `FEATURE_UNAVAILABLE`; inspect `isError`
before using a result. Invalid inputs/unknown tools may be protocol errors.
Disallowed Host/Origin values return 403; unsupported HTTP methods return 405.
Local loopback hosts and the Render hostname are supported; browser origins
must also satisfy the backend's CORS settings and MCP origin validation.

Shared migration history must be checked before rollout, and Isaiah must review
boundary/authentication changes. This guide does not authorize enabling a shared
pilot or deploying the service.
