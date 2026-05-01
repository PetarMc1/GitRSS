import { useEffect, useState } from 'react';
import { API_BASE } from '../config';
import { logger } from '../utils/logger';

export type BackendStatus = 'checking' | 'ok' | 'unreachable';

export function useBackendHealth(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    logger.info('Checking backend health...');

    fetch(`${API_BASE}/health`, { signal: controller.signal })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (res.ok) {
          logger.info('Backend reachable');
          setStatus('ok');
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
