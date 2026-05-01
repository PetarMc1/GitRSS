interface ApiErrorBody {
  error?: string;
}

export function parseApiError(status: number, body: ApiErrorBody | null): string {
  const serverMsg = body?.error ?? null;

  switch (status) {
    case 400:
      return serverMsg ?? 'Invalid request parameters.';

    case 404:
      return 'Repository not found. Make sure the owner/repo is correct and the repository is public.';

    case 429:
      return serverMsg ?? 'GitHub API rate limit exceeded. Please wait a moment and try again.';

    case 500:
    case 502:
    case 503:
      return 'Backend error. Please try again later.';

    default:
      return serverMsg ?? `Unexpected error (HTTP ${status}).`;
  }
}

export function parseNetworkError(err: unknown): string {
  if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
    return 'Cannot reach the GitRSS backend. Make sure it is running on port 4000.';
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'Request timed out. The backend may be slow or unreachable.';
  }
  return err instanceof Error ? err.message : String(err);
}
