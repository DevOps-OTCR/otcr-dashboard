import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GetUser } from '../../common/get-user.decorator';
import { ProjectsService } from '../../projects/projects.service';
import { toAgentErrorEvent } from '../agent/agent-errors';
import type { AgentEvent } from '../agent/agent.events';
import { AgentService } from '../agent/agent.service';
import type { AgentUser } from '../agent/agent.types';
import { ChatDto } from './chat.dto';

// The global AgenticCmsGuard already checks the release flag, signs the user in
// (AuthGuard) and checks the pilot allowlist for every /agentic-cms route.
@Controller('agentic-cms/chat')
export class ChatController {
  constructor(
    private readonly agent: AgentService,
    private readonly projects: ProjectsService,
  ) {}

// POST /agentic-cms/chat — streams AgentEvents as Server-Sent Events.
  @Post()
  async chat(@Body() dto: ChatDto, @GetUser() user: AgentUser, @Res() res: Response) {
    await this.projects.assertProjectAccess(dto.projectId, user);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const send = (event: AgentEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const heartbeat = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), 15_000);

    try {
      await this.agent.run(
        { user, projectId: dto.projectId, sprintId: dto.sprintId, conversationId: dto.conversationId, message: dto.message, signal: abort.signal },
        send,
      );
    } catch (err) {
      if (!abort.signal.aborted) send(toAgentErrorEvent(err));
    } finally {
      clearInterval(heartbeat);
      send({ type: 'done' });
      res.end();
    }
  }
}