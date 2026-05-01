import { Controller, Get } from '@nestjs/common';

@Controller()
export class MetaController {
  @Get('__meta')
  getMeta() {
    return {
      service: 'otcr-dashboard-backend',
      now: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV ?? null,
      render: {
        gitCommit: process.env.RENDER_GIT_COMMIT ?? null,
        serviceId: process.env.RENDER_SERVICE_ID ?? null,
        serviceName: process.env.RENDER_SERVICE_NAME ?? null,
      },
    };
  }
}

