import { useEffect, useState } from 'react';
import { apiBase } from '../config';
import { logger } from '../utils/logger';

export type BackendStatus = 'checking' | 'ok' | 'degraded' | 'unreachable';

type HealthResponse = {
  status: string;
  services: {
    redis: string;
    github: string;
  };
  timestamp: string;
};

export function useBackendHealth(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    logger.info('Checking backend health...');

    fetch(`${apiBase}/health`, { signal: controller.signal })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (res.ok) {
          try {
            const data = (await res.json()) as HealthResponse;
            if (data.status === 'degraded') {
              logger.warn('Backend degraded', data.services);
              setStatus('degraded');
            } else {
              logger.info('Backend reachable', data.services);
              setStatus('ok');
            }
          } catch {
            logger.info('Backend reachable (non-JSON)');
            setStatus('ok');
          }
        } else {
          logger.warn('Backend health check returned', res.status);
          setStatus('unreachable');
        }
      })
      .catch((err: unknown) => {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
          logger.warn('Backend health check timed out');
        } else {
          logger.warn('Backend unreachable:', err);
        }
        setStatus('unreachable');
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return status;
}
