import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

const logger = new Logger('RedisConfig');

export const createRedisConnection = (configService: ConfigService): Redis | null => {
  const redisUrl = configService.get<string>('REDIS_URL');

  if (redisUrl) {
    try {
      return new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.warn('Redis connection failed after 3 retries, continuing without Redis');
            return null; // Stop retrying
          }
          return Math.min(times * 50, 2000);
        },
        lazyConnect: true,
      });
    } catch (error) {
      logger.warn('Failed to create Redis connection, continuing without Redis');
      return null;
    }
  }

  // Fallback to individual host/port
  const host = configService.get<string>('REDIS_HOST') || 'localhost';
  const port = parseInt(configService.get<string>('REDIS_PORT') || '6379', 10);
  
  try {
    return new Redis({
      host,
      port,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn('Redis connection failed after 3 retries, continuing without Redis');
          return null;
        }
        return Math.min(times * 50, 2000);
      },
      lazyConnect: true,
    });
  } catch (error) {
    logger.warn('Failed to create Redis connection, continuing without Redis');
    return null;
  }
};
