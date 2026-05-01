import { createClient } from 'redis';
import { getRedisUrl } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { HttpError } from '../utils/http.js';

type RedisClient = ReturnType<typeof createClient>;

let redisClientPromise: Promise<RedisClient> | undefined;

function describeRedisError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      value: String(error),
    };
  }

  const withCode = error as Error & { code?: string; errno?: number; address?: string; port?: number };

  return {
    name: error.name,
    message: error.message || '(empty message)',
    ...(withCode.code ? { code: withCode.code } : {}),
    ...(withCode.errno !== undefined ? { errno: withCode.errno } : {}),
    ...(withCode.address ? { address: withCode.address } : {}),
    ...(withCode.port !== undefined ? { port: withCode.port } : {}),
    ...(error.cause ? { cause: String(error.cause) } : {}),
  };
}

export async function getRedisClient(): Promise<RedisClient> {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    throw new HttpError(500, 'REDIS_URL is not configured. Redis-backed RSS endpoints are unavailable.');
  }

  if (redisClientPromise) {
    return redisClientPromise;
  }

  redisClientPromise = (async () => {
    const client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: false,
      },
    });

    client.on('error', (error) => {
      logger.error('Redis client error', describeRedisError(error));
    });

    await client.connect();
    logger.info('Redis connected');
    return client;
  })().catch((error) => {
    logger.error('Redis unavailable. Redis-backed RSS endpoints are unavailable.', {
      url: redisUrl,
      ...describeRedisError(error),
    });
    redisClientPromise = undefined;
    throw error;
  });

  return redisClientPromise;
}

export async function isRedisAvailable(): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    await redis.ping();
    return true;
  } catch (error) {
    logger.warn('Redis availability check failed', describeRedisError(error));
    return false;
  }
}