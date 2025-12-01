import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const createRedisConnection = (configService: ConfigService): Redis => {
  const redisUrl = configService.get<string>('REDIS_URL');

  if (redisUrl) {
    return new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  // Fallback to individual host/port
  return new Redis({
    host: configService.get<string>('REDIS_HOST') || 'localhost',
    port: parseInt(configService.get<string>('REDIS_PORT') || '6379', 10),
    maxRetriesPerRequest: null,
  });
};
