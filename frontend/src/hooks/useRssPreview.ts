import { useCallback, useState } from 'react';
import { logger } from '../utils/logger';
import { parseApiError, parseNetworkError } from '../utils/parseApiError';

interface PreviewState {
  loading: boolean;
  content: string | null;
  error: string | null;
  itemCount: number | null;
}

function countRssItems(xml: string): number {
  return (xml.match(/<item>/g) ?? []).length;
}

export function useRssPreview() {
  const [state, setState] = useState<PreviewState>({
    loading: false,
    content: null,
    error: null,
    itemCount: null,
  });

  const fetchPreview = useCallback(async (url: string) => {
    setState({ loading: true, content: null, error: null, itemCount: null });
    logger.info('Fetching RSS preview:', url);

    try {
      const res = await fetch(url);

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        const message = parseApiError(res.status, body);
        logger.error(`Preview fetch failed - HTTP ${res.status}:`, message);
        setState({ loading: false, content: null, error: message, itemCount: null });
        return;
      }

      const text = await res.text();
      const itemCount = countRssItems(text);
      logger.info(`Preview loaded - ${itemCount} item(s) found`);
      setState({ loading: false, content: text, error: null, itemCount });
    } catch (err) {
      const message = parseNetworkError(err);
      logger.error('Preview network error:', err);
      setState({ loading: false, content: null, error: message, itemCount: null });
    }
  }, []);

  const clearPreview = useCallback(() => {
    setState({ loading: false, content: null, error: null, itemCount: null });
  }, []);

  return { ...state, fetchPreview, clearPreview };
}
