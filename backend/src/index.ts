import express from 'express';
import cors from 'cors';
import { getGithubToken, getRedisUrl, getServerPort } from './config/env.js';
import { rssRouter } from './routes/rss.js';
import { buildGithubHeaders } from './services/githubClient.js';
import { getRedisClient, isRedisAvailable } from './services/redisClient.js';
import { isHttpError } from './utils/http.js';
import { logger } from './utils/logger.js';

const app = express();
const port = getServerPort();

app.use(cors());
app.use(express.json());
app.use('/rss', async (_req, res, next) => {
  const redisAvailable = await isRedisAvailable();
  if (!redisAvailable) {
    res.status(503).json({ status: 'down', service: 'backend', db: 'down' });
    return;
  }

  next();
});
app.use('/rss', rssRouter);

app.get('/health', async (_req, res) => {
  const redisAvailable = await isRedisAvailable();
  if (!redisAvailable) {
    res.status(503).type('text/plain').send('not ok');
    return;
  }

  res.status(200).type('text/plain').send('ok');
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (isHttpError(error)) {
    if (error.headers) {
      for (const [headerName, headerValue] of Object.entries(error.headers)) {
        res.setHeader(headerName, headerValue);
      }
    }

    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unknown server error';
  res.status(500).json({ error: message });
});

async function logStartupDiagnostics(): Promise<void> {
  const redisUrl = getRedisUrl();
  try {
    const redisClient = await getRedisClient();
    logger.info('Startup: Redis connected', { url: redisUrl, isOpen: redisClient.isOpen });
  } catch (error) {
    logger.warn('Startup: Redis unavailable, API routes will return status down', {
      url: redisUrl,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const githubToken = getGithubToken();
  if (!githubToken) {
    logger.warn('Startup: GitHub token not configured');
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://api.github.com/rate_limit', {
      headers: buildGithubHeaders(),
      signal: controller.signal,
    });

    if (response.ok) {
      logger.info('Startup: GitHub token is configured and works');
      return;
    }

    logger.warn('Startup: GitHub token is configured but validation failed', {
      status: response.status,
    });
  } catch (error) {
    logger.warn('Startup: GitHub token validation could not be completed', {
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function startServer(): Promise<void> {
  await logStartupDiagnostics();

  app.listen(port, () => {
    logger.info('Startup: Backend running', { port });
  });
}

void startServer().catch((error) => {
  logger.error('Startup failed', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

