const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkBoundaries } = require('./check-agentic-boundaries.cjs');

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-boundaries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), contents);
  }
  return checkBoundaries(root);
}
test('rejects static or dynamic feature imports from ordinary CMS pages', t => {
  assert.equal(fixture(t, {
    'frontend/app/slides/page.tsx': "import Bot from '@/features/agentic-cms';",
    'frontend/lib/api.ts': "import('../features/agentic-cms/tools');",
  }).length, 2);
});
test('rejects backend bypasses, misplaced controllers and exposed model secrets', t => {
  assert.equal(fixture(t, {
    'backend/src/tasks/tasks.service.ts': "import { Tools } from '../agentic-cms/tools';",
    'backend/src/agentic-cms/review.controller.ts': "@Controller('reviews') class Review {}",
    'backend/src/tasks/ai.controller.ts': "@Controller('agentic-cms/chat') class Chat {}",
    'frontend/lib/provider.ts': 'const key = process.env.NEXT_PUBLIC_LUMEN_API_KEY;',
  }).length, 4);
});
test('rejects misplaced AI SDKs and independent switches', t => {
  assert.equal(fixture(t, {
    'backend/src/tasks/ai.ts': "import OpenAI from 'openai';",
    'frontend/lib/switch.ts': 'const flag = process.env.AGENTIC_CMS_ENABLED;',
  }).length, 2);
});
test('allows canonical gated imports and internal feature modules', t => {
  assert.deepEqual(fixture(t, {
    'frontend/components/AgenticCmsFeature.tsx': "const Bot = lazy(() => import('@/features/agentic-cms'));",
    'frontend/features/agentic-cms/index.tsx': "import './sidebar';",
    'backend/src/app.module.ts': "import { AgenticCmsModule } from './agentic-cms/agentic-cms.module';",
    'backend/src/agentic-cms/tools.ts': "import OpenAI from 'openai';",
    'backend/src/agentic-cms/chat.controller.ts': "@Controller('agentic-cms/chat') class Chat {}",
  }), []);
});
test('keeps split MCP SDK packages inside the backend feature boundary', t => {
  for (const pkg of ['server', 'node', 'client', 'express', 'sdk']) {
    assert.equal(fixture(t, {
      'backend/src/tasks/mcp.ts': `import { Tool } from '@modelcontextprotocol/${pkg}';`,
      'frontend/lib/mcp.ts': `import('@modelcontextprotocol/${pkg}');`,
    }).length, 2);
    assert.deepEqual(fixture(t, {
      'backend/src/agentic-cms/mcp/internal.ts': `import { Tool } from '@modelcontextprotocol/${pkg}';`,
    }), []);
  }
});
