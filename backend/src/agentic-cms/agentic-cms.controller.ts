import { Controller, Get } from '@nestjs/common';

// All agent endpoints belong under this prefix; the global guard protects them.
@Controller('agentic-cms')
export class AgenticCmsController {
  @Get('status')
  getStatus() {
    return { enabled: true };
  }
}
