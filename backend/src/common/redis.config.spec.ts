import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createRedisConnection } from './redis.config';

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it('does not connect when Redis is disabled, even if a URL is configured', () => {
  const config = new ConfigService({
    REDIS_ENABLED: 'false',
    REDIS_URL: 'redis://example.test:6379',
  });

  expect(createRedisConnection(config)).toBeNull();
  expect(Redis).not.toHaveBeenCalled();
});

it('keeps Redis enabled by default', () => {
  const config = new ConfigService({ REDIS_URL: 'redis://example.test:6379' });

  expect(createRedisConnection(config)).not.toBeNull();
  expect(Redis).toHaveBeenCalledWith(
    'redis://example.test:6379',
    expect.objectContaining({ maxRetriesPerRequest: null, lazyConnect: true }),
  );
});
