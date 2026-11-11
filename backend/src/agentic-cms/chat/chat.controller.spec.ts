/* eslint-disable @typescript-eslint/no-explicit-any -- Nest test doubles */
import { ForbiddenException, Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthModule } from '../../auth/auth.module';
import { FeatureFlagsModule } from '../../feature-flags/feature-flags.module';
import { ProjectsService } from '../../projects/projects.service';
import { AgentService } from '../agent/agent.service';
import { ConversationStore } from '../agent/conversation.store';
import { FakeModelClient } from '../model/fake-test-model.client';
import { MODEL_CLIENT, type ModelClient } from '../model/model-client';
import { TavilySearchClient } from '../search/tavily-search.client';
import { SkillLibrary } from '../skills/skill-library';
import { CmsReadService } from '../reads/cms-read.service';
import { CmsReadTools } from '../tools/cms-read.tools';
import { LoadSkillTool } from '../tools/load-skill.tool';
import { ToolRegistry } from '../tools/tool-registry';
import { WebSearchTool } from '../tools/web-search.tool';
import { ChatController } from './chat.controller';

// Spec for POST /agentic-cms/chat over real HTTP, behind the real global
// AgenticCmsGuard: flag off/on and pilot allowlist, SSE format, project access
// before streaming, validation, and errors as stream events.
// AuthGuard (which calls Microsoft) is replaced by an `x-test-user` header.

const auth = {
  canActivate: jest.fn((ctx: any) => {
    const req = ctx.switchToHttp().getRequest();
    const email = req.headers['x-test-user'];
    if (!email) return false;
    req.user = { id: `id-${email}`, email, role: 'CONSULTANT' };
    return true;
  }),
};
@Module({ providers: [{ provide: AuthGuard, useValue: auth }], exports: [AuthGuard] })
class TestAuthModule {}

describe('POST /agentic-cms/chat', () => {
  let app: INestApplication;
  let url: string;
  let settings: Record<string, string>;
  const fake = new FakeModelClient();
  const model: ModelClient & { stream: jest.Mock } = { name: 'spy', stream: jest.fn((req, onText) => fake.stream(req, onText)) };
  const projects = {
    assertProjectAccess: jest.fn(async (projectId: string) => {
      if (projectId === 'forbidden') throw new ForbiddenException('You do not have access to this project');
      return { id: projectId, pmId: 'pm' };
    }),
    getSprint: jest.fn(async (_projectId: string, sprintId: string) =>
      ({ released: { id: sprintId, status: 'RELEASED' }, draft: { id: sprintId, status: 'DRAFT' } })[sprintId] ?? null),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [FeatureFlagsModule],
      controllers: [ChatController],
      providers: [
        AgentService,
        ConversationStore,
        ToolRegistry,
        WebSearchTool,
        LoadSkillTool,
        CmsReadTools,
        { provide: CmsReadService, useValue: {} },
        TavilySearchClient,
        SkillLibrary,
        { provide: MODEL_CLIENT, useValue: model },
        { provide: ProjectsService, useValue: projects },
      ],
    })
      .overrideModule(AuthModule)
      .useModule(TestAuthModule)
      .overrideGuard(AuthGuard)
      .useValue(auth)
      .useMocker((token) => (token === ConfigService ? { get: (key: string) => settings[key] } : undefined))
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  beforeEach(() => {
    settings = { AGENTIC_CMS_ENABLED: 'true' };
    model.stream.mockClear();
    projects.assertProjectAccess.mockClear();
  });

  afterAll(() => app.close());

  async function chat(body: unknown, opts: { token?: string; user?: string } = {}) {
    const res = await fetch(`${url}/agentic-cms/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token ?? 'eyJ.fake.token'}`,
        'x-test-user': opts.user ?? 'consultant@illinois.edu',
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    const events = raw
      .split('\n\n')
      .filter((f) => f.startsWith('data: '))
      .map((f) => JSON.parse(f.slice(6)));
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', raw, events };
  }

  describe('flag off', () => {
    it.each([undefined, 'false', 'TRUE'])('returns 404 and never calls the model or reads the project (%s)', async (value) => {
      settings = value === undefined ? {} : { AGENTIC_CMS_ENABLED: value };
      const r = await chat({ projectId: 'p1', message: 'hello' });
      expect(r.status).toBe(404);
      expect(model.stream).not.toHaveBeenCalled();
      expect(projects.assertProjectAccess).not.toHaveBeenCalled();
    });

    it('returns 404 for a user outside the pilot allowlist', async () => {
      settings.AGENTIC_CMS_ALLOWED_EMAILS = 'pilot@illinois.edu';
      expect((await chat({ projectId: 'p1', message: 'hello' }, { user: 'other@illinois.edu' })).status).toBe(404);
      expect((await chat({ projectId: 'p1', message: 'hello' }, { user: 'PILOT@illinois.edu' })).status).toBe(200);
    });
  });

  describe('flag on', () => {
    it('streams Server-Sent Events that end with done', async () => {
      const r = await chat({ projectId: 'p1', message: 'hello' });
      expect(r.status).toBe(200);
      expect(r.contentType).toContain('text/event-stream');
      expect(r.raw).toMatch(/^data: /);
      const types = r.events.map((e) => e.type);
      expect(types[0]).toBe('conversation');
      expect(types).toContain('text_delta');
      expect(types[types.length - 1]).toBe('done');
    });

    it('checks project access with the signed-in user before streaming', async () => {
      await chat({ projectId: 'p1', message: 'hello' });
      expect(projects.assertProjectAccess).toHaveBeenCalledWith('p1', expect.objectContaining({ email: 'consultant@illinois.edu' }));
    });

    it('returns a plain 403, not a stream, when the user is not on the project', async () => {
      const r = await chat({ projectId: 'forbidden', message: 'hello' });
      expect(r.status).toBe(403);
      expect(r.contentType).toContain('application/json');
      expect(model.stream).not.toHaveBeenCalled();
    });

    it('allows a released sprint', async () => {
      const r = await chat({ projectId: 'p1', sprintId: 'released', message: 'hello' });
      expect(r.status).toBe(200);
      expect(projects.getSprint).toHaveBeenCalledWith('p1', 'released');
    });

    it('returns 404 for a sprint outside the project, before any model call', async () => {
      model.stream.mockClear();
      const r = await chat({ projectId: 'p1', sprintId: 'other-project', message: 'hello' });
      expect(r.status).toBe(404);
      expect(model.stream).not.toHaveBeenCalled();
    });

    it('hides draft sprints from consultants, before any model call', async () => {
      model.stream.mockClear();
      const r = await chat({ projectId: 'p1', sprintId: 'draft', message: 'hello' });
      expect(r.status).toBe(403);
      expect(model.stream).not.toHaveBeenCalled();
    });

    it('rejects bad bodies with 400', async () => {
      expect((await chat({ projectId: 'p1' })).status).toBe(400);
      expect((await chat({ projectId: 'p1', message: 'hi', admin: true })).status).toBe(400);
    });

    it('turns a model failure into an error event followed by done', async () => {
      const r = await chat({ projectId: 'p1', message: 'fail model' });
      expect(r.status).toBe(200);
      expect(r.events.slice(-2)).toEqual([
        { type: 'error', kind: 'model', retryable: true, message: expect.any(String) },
        { type: 'done' },
      ]);
    });

    it('ends with a "disabled" event when the flag is switched off mid-reply', async () => {
      const call = { id: 'c1', name: 'lookup', args: {} };
      model.stream.mockImplementationOnce(async () => {
        settings.AGENTIC_CMS_ENABLED = 'false';
        return { text: '', toolCalls: [call], message: { role: 'assistant', content: null } };
      });
      const r = await chat({ projectId: 'p1', message: 'hello' });
      expect(r.status).toBe(200);
      expect(r.events.slice(-2)).toEqual([
        { type: 'error', kind: 'disabled', retryable: false, message: expect.stringMatching(/turned off/i) },
        { type: 'done' },
      ]);
      expect(model.stream).toHaveBeenCalledTimes(1);
    });
  });
});