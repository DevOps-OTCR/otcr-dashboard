import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { CmsReader } from '../authorization/cms-read-access.service';
import { McpServerService } from './mcp-server.service';

// The global AgenticCmsGuard checks the flag and verified auth before this handler.
@Controller('agentic-cms/mcp')
export class McpController {
  constructor(private readonly mcp: McpServerService) {}

  @All()
  handle(@Req() request: Request & { user: CmsReader }, @Res() response: Response) {
    return this.mcp.handle(request, response);
  }
}
