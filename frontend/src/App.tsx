import { useEffect, useMemo, useState } from 'react';
import SwaggerUI from 'swagger-ui-react';
import { AllFeedOptions } from './components/AllFeedOptions';
import { CommitFilters } from './components/CommitFilters';
import { FeedTypeSelector } from './components/FeedTypeSelector';
import { RepoInput } from './components/RepoInput';
import { RssOutput } from './components/RssOutput';
import { StateFilter } from './components/StateFilter';
import { ADMIN_STORAGE_KEY, apiBase } from './config';
import { useBackendHealth } from './hooks/useBackendHealth';
import { buildRssUrl } from './hooks/useRssUrl';
import type { AllFeedState, CommitFiltersState, FeedType, ItemState } from './types';
import { parseApiError, parseNetworkError } from './utils/parseApiError';
import { validateForm } from './utils/validation';
import 'swagger-ui-react/swagger-ui.css';
import './App.css';

const statusLabel: Record<string, string> = {
  checking: 'Backend: checking…',
  ok: 'Backend: online',
  degraded: 'Backend: degraded',
  unreachable: 'Backend: offline',
};

const lastUpdated = '2026-04-26';

type AppRoute = '/' | '/faq' | '/terms' | '/api-docs' | '/admin';

const openapiURL = new URL('./docs/openapi.json', import.meta.url).href;

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

type TermsSection = {
  id: string;
  title: string;
  body: string;
};

type RecentRequest = {
  at: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string;
};

type CachePageEntry = {
  key: string;
  repoScope: string;
  page: number;
  isDeepCached: boolean;
  itemCount: number;
  lastFetched: string;
  ttlSeconds: number;
};

type AdminOverview = {
  generatedAt: string;
  status: 'ok' | 'degraded';
  message: string | null;
  redisAvailable: boolean;
  deepRefreshDays: number;
  githubRateLimit: {
    available: boolean;
    limit: number | null;
    remaining: number | null;
    used: number | null;
    resetAt: string | null;
    resetsInSeconds: number | null;
    authenticated: boolean;
    source: 'live-headers' | 'unavailable';
  };
  recentRequests: RecentRequest[];
  cache: {
    summary: {
      dataPages: number;
      deepCachedPages: number;
      nonDeepCachedPages: number;
      etagKeys: number;
      metadataKeys: number;
      notificationsKeys: number;
    };
    pages: CachePageEntry[];
    deepPages: CachePageEntry[];
    nonDeepPages: CachePageEntry[];
    repoBreakdown: Array<{
      repoScope: string;
      deepCachedPages: number;
      nonDeepCachedPages: number;
      totalPages: number;
      deepTtlSeconds: number | null;
      nonDeepTtlSeconds: number | null;
    }>;
  };
};

const faqItems: FaqItem[] = [
  {
    id: 'what-is-this-app',
    question: 'What is this app?',
    answer: 'A GitHub RSS feed generator that converts repositories into RSS feeds.',
  },
  {
    id: 'how-fresh-is-data',
    question: 'How fresh is the data?',
    answer: 'Data is cached and may be delayed depending on system load and rate limits.',
  },
  {
    id: 'why-not-realtime',
    question: 'Why is data sometimes not real-time?',
    answer: 'Due to GitHub API rate limits and caching layers.',
  },
  {
    id: 'why-updates-late',
    question: 'Why do some updates appear late?',
    answer: 'Deep cache pages are refreshed periodically, not instantly.',
  },
  {
    id: 'can-i-be-blocked',
    question: 'Can I get banned or blocked?',
    answer: 'Yes, access may be restricted at any time.',
  },
  {
    id: 'official-github-product',
    question: 'Is this an official GitHub product?',
    answer: 'No, this project is not affiliated with GitHub.',
  },
];

const termsSection: TermsSection[] = [
  {
    id: 'service-changes',
    title: 'Service Changes',
    body: 'The service may be modified, suspended, or discontinued at any time, with or without notice.',
  },
  {
    id: 'api-and-caching-changes',
    title: 'API and Caching Changes',
    body: 'API behavior, caching strategy, synchronization logic, and update frequency may change at any time without prior notice.',
  },
  {
    id: 'access-restrictions',
    title: 'Access Restrictions',
    body: 'Users may be blocked, restricted, or banned from using the service at any time, with or without explanation.',
  },
  {
    id: 'github-rate-limits',
    title: 'GitHub Rate Limits',
    body: 'GitHub API rate limits may restrict, delay, or prevent updates and responses.',
  },
  {
    id: 'data-freshness',
    title: 'Data Freshness',
    body: 'Data freshness is not guaranteed. Delays, stale data, and partial data may occur due to external API limits, network conditions, or service decisions.',
  },
  {
    id: 'external-dependency',
    title: 'External Dependency',
    body: 'The service depends on GitHub API availability. If GitHub is unavailable, restricted, or degraded, this service may fail or provide degraded responses.',
  },
  {
    id: 'cached-data-usage',
    title: 'Cached Data Usage',
    body: 'Cached data may be served instead of real-time data at any time to preserve performance, reliability, or rate-limit compliance.',
  },
  {
    id: 'availability-disclaimer',
    title: 'Availability Disclaimer',
    body: 'No guarantee is made regarding continuous availability, uptime, response times, or uninterrupted operation.',
  },
];

function normalizeRoute(pathname: string): AppRoute {
  if (pathname === '/admin') {
    return '/admin';
  }

  if (pathname === '/api-docs') {
    return '/api-docs';
  }

  if (pathname === '/faq') {
    return '/faq';
  }

  if (pathname === '/terms') {
    return '/terms';
  }

  return '/';
}

function navigateTo(path: AppRoute): void {
  if (window.location.pathname === path) {
    return;
  }

  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function HeaderNav({ route }: { route: AppRoute }) {
  return (
    <nav className="top-nav" aria-label="Primary navigation">
      <a
        className={`top-nav_link ${route === '/' ? 'top-nav_link-active' : ''}`}
        href="/"
        onClick={(event) => {
          event.preventDefault();
          navigateTo('/');
        }}
      >
        Home
      </a>
      <a
        className={`top-nav_link ${route === '/faq' ? 'top-nav_link-active' : ''}`}
        href="/faq"
        onClick={(event) => {
          event.preventDefault();
          navigateTo('/faq');
        }}
      >
        FAQ
      </a>
      <a
        className={`top-nav_link ${route === '/api-docs' ? 'top-nav_link-active' : ''}`}
        href="/api-docs"
        onClick={(event) => {
          event.preventDefault();
          navigateTo('/api-docs');
        }}
      >
        API Docs
      </a>
      <a
        className={`top-nav_link ${route === '/terms' ? 'top-nav_link-active' : ''}`}
        href="/terms"
        onClick={(event) => {
          event.preventDefault();
          navigateTo('/terms');
        }}
      >
        Terms
      </a>
    </nav>
  );
}

function FooterNav() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="app-footer_links">
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigateTo('/');
          }}
        >
          Home
        </a>
        <span aria-hidden="true">•</span>
        <a
          href="/faq"
          onClick={(event) => {
            event.preventDefault();
            navigateTo('/faq');
          }}
        >
          FAQ
        </a>
        <span aria-hidden="true">•</span>
        <a
          href="/api-docs"
          onClick={(event) => {
            event.preventDefault();
            navigateTo('/api-docs');
          }}
        >
          API Docs
        </a>
        <span aria-hidden="true">•</span>
        <a
          href="/terms"
          onClick={(event) => {
            event.preventDefault();
            navigateTo('/terms');
          }}
        >
          Terms
        </a>
      </div>
      <p className="app-footer_legal">
        Copyright © {currentYear} <a href="https://github.com/PetarMc1">PetarMc1</a>. Licensed under Apache License 2.0. <br/> Not
        affiliated with <a href='https://github.com'>GitHub</a>.
      </p>
    </footer>
  );
}

function TermsPage() {
  return (
    <section className="card static-page" aria-labelledby="terms-title">
      <h2 id="terms-title" className="static-page_title">Terms of Service</h2>
      <p className="static-page_updated">Last updated: {lastUpdated}</p>
      <p>These Terms of Service govern access to and use of this GitRSS service.</p>

      <ol className="terms-list">
        {termsSection.map((section) => (
          <li key={section.id}>
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </li>
        ))}
      </ol>

      <p>By using the service, you acknowledge and accept these conditions.</p>
    </section>
  );
}

function ApiDocsPage() {
  return (
    <section className="api-docs-page" aria-labelledby="api-docs-title">
      <div className="api-docs-header">
        <h2 id="api-docs-title" className="static-page_title">API Docs</h2>
      </div>

      <div className="api-docs-shell">
        <SwaggerUI
          url={openapiURL}
          docExpansion="list"
          displayRequestDuration
          defaultModelsExpandDepth={-1}
        />
      </div>
    </section>
  );
}

function FaqPage() {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return faqItems;
    }

    return faqItems.filter((item) => {
      const haystack = `${item.question} ${item.answer}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  return (
    <section className="card static-page" aria-labelledby="faq-title">
      <h2 id="faq-title" className="static-page_title">FAQ</h2>
      <p className="static-page_updated">Last updated: {lastUpdated}</p>
      <div className="faq-list">
        {filteredItems.map((item) => (
          <details key={item.id} className="faq-item">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatTtlSeconds(ttlSeconds: number | null): string {
  if (ttlSeconds === null || ttlSeconds < 0) {
    return 'no expiry';
  }

  if (ttlSeconds >= 86_400) {
    const days = Math.floor(ttlSeconds / 86_400);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }

  if (ttlSeconds >= 3_600) {
    const hours = Math.floor(ttlSeconds / 3_600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  if (ttlSeconds >= 60) {
    const minutes = Math.floor(ttlSeconds / 60);
    return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
  }

  return `${ttlSeconds} ${ttlSeconds === 1 ? 'second' : 'seconds'}`;
}

function AdminPage() {
  const [passwordInput, setPasswordInput] = useState('');
  const [adminPassword, setAdminPassword] = useState<string | null>(
    () => window.sessionStorage.getItem(ADMIN_STORAGE_KEY),
  );
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async (password: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/admin-api/overview`, {
        headers: {
          'x-admin-password': password,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        const message = parseApiError(res.status, body);
        setError(message);

        if (res.status === 401) {
          setAdminPassword(null);
          window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
        }

        setLoading(false);
        return;
      }

      const payload = await res.json() as AdminOverview;
      setOverview(payload);
      setLoading(false);
    } catch (err) {
      setError(parseNetworkError(err));
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const trimmedPassword = passwordInput.trim();
    if (!trimmedPassword) {
      setError('Enter the admin password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/admin-api/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ password: trimmedPassword }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setError(parseApiError(res.status, body));
        setLoading(false);
        return;
      }

      setAdminPassword(trimmedPassword);
      window.sessionStorage.setItem(ADMIN_STORAGE_KEY, trimmedPassword);
      setPasswordInput('');
      await fetchOverview(trimmedPassword);
    } catch (err) {
      setError(parseNetworkError(err));
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAdminPassword(null);
    setOverview(null);
    setError(null);
    window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
  };

  useEffect(() => {
    if (!adminPassword) {
      return;
    }

    void fetchOverview(adminPassword);
  }, [adminPassword]);

  if (!adminPassword) {
    return (
      <section className="card static-page" aria-labelledby="admin-login-title">
        <h2 id="admin-login-title" className="static-page_title">Admin</h2>
        <p className="static-page_updated">Sign in with the admin password configured on the backend.</p>

        <div className="field">
          <label className="label" htmlFor="admin-password">Admin password</label>
          <input
            id="admin-password"
            type="password"
            className="input"
            value={passwordInput}
            onChange={(event) => setPasswordInput(event.target.value)}
            placeholder="Enter admin password"
            autoComplete="current-password"
          />
        </div>

        {error && <p className="error-msg" role="alert">{error}</p>}

        <button type="button" className="btn btn--primary" onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </section>
    );
  }

  return (
    <section className="admin-page" aria-labelledby="admin-title">
      <div className="card static-page">
        <div className="admin-header-row">
          <div>
            <h2 id="admin-title" className="static-page_title">Admin</h2>
            <p className="static-page_updated">
              Last snapshot: {overview ? formatDateTime(overview.generatedAt) : 'loading...'}
            </p>
          </div>

          <div className="admin-actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                if (adminPassword) {
                  void fetchOverview(adminPassword);
                }
              }}
              disabled={loading}
            >
              Refresh
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>

        {error && <p className="error-msg" role="alert">{error}</p>}

        {overview?.status === 'degraded' && overview.message && (
          <p className="error-msg" role="status">{overview.message}</p>
        )}

        {loading && !overview && <p className="static-page_empty">Loading admin data...</p>}

        {overview && (
          <>
            <div className="admin-summary-grid">
              <div className="admin-summary-card">
                <span>Redis</span>
                <strong>{overview.redisAvailable ? 'Available' : 'Unavailable'}</strong>
              </div>
              <div className="admin-summary-card">
                <span>GitHub remaining</span>
                <strong>
                  {overview.githubRateLimit.remaining !== null && overview.githubRateLimit.limit !== null
                    ? `${overview.githubRateLimit.remaining}/${overview.githubRateLimit.limit}`
                    : 'Unavailable'}
                </strong>
              </div>
              <div className="admin-summary-card">
                <span>Deep refresh interval</span>
                <strong>{overview.deepRefreshDays} day(s)</strong>
              </div>
              <div className="admin-summary-card">
                <span>Data pages</span>
                <strong>{overview.cache.summary.dataPages}</strong>
              </div>
              <div className="admin-summary-card">
                <span>Deep cached pages</span>
                <strong>{overview.cache.summary.deepCachedPages}</strong>
              </div>
              <div className="admin-summary-card">
                <span>Non-deep cached pages</span>
                <strong>{overview.cache.summary.nonDeepCachedPages}</strong>
              </div>
              <div className="admin-summary-card">
                <span>ETag keys</span>
                <strong>{overview.cache.summary.etagKeys}</strong>
              </div>
            </div>

            <div className="admin-section">
              <h3>Recent /rss requests (last 10)</h3>
              {overview.recentRequests.length === 0 ? (
                <p className="static-page_empty">No requests recorded yet.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Method</th>
                        <th>Path</th>
                        <th>Status</th>
                        <th>Latency</th>
                        <th>IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentRequests.map((entry, index) => (
                        <tr key={`${entry.at}-${entry.path}-${index}`}>
                          <td>{formatDateTime(entry.at)}</td>
                          <td>{entry.method}</td>
                          <td className="admin-table_path">{entry.path}</td>
                          <td>{entry.statusCode}</td>
                          <td>{entry.durationMs} ms</td>
                          <td>{entry.ip}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="admin-section">
              <h3>Cache explorer</h3>
              <p className="static-page_updated">Deep and non-deep cache pages are separated below.</p>

              {overview.cache.repoBreakdown.length === 0 ? (
                <p className="static-page_empty">No cache pages found.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Repo scope</th>
                        <th>Total pages</th>
                        <th>Deep cached pages</th>
                        <th>Non-deep cached pages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.cache.repoBreakdown.map((entry) => (
                        <tr key={entry.repoScope}>
                          <td className="admin-table_path">{entry.repoScope}</td>
                          <td>{entry.totalPages}</td>
                          <td>{entry.deepCachedPages}</td>
                          <td>{entry.nonDeepCachedPages}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3>All deep cached pages</h3>

              {overview.cache.repoBreakdown.filter((entry) => entry.deepCachedPages > 0).length === 0 ? (
                <p className="static-page_empty">No deep cached repos found.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Repo</th>
                        <th>Deep cached pages</th>
                        <th>TTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.cache.repoBreakdown
                        .filter((entry) => entry.deepCachedPages > 0)
                        .map((entry) => (
                        <tr key={`${entry.repoScope}-deep`}>
                          <td className="admin-table_path">{entry.repoScope}</td>
                          <td>{entry.deepCachedPages}</td>
                          <td>{formatTtlSeconds(entry.deepTtlSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3>All non-deep cached pages</h3>

              {overview.cache.repoBreakdown.filter((entry) => entry.nonDeepCachedPages > 0).length === 0 ? (
                <p className="static-page_empty">No non-deep cached repos found.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Repo</th>
                        <th>Non-deep cached pages</th>
                        <th>TTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.cache.repoBreakdown
                        .filter((entry) => entry.nonDeepCachedPages > 0)
                        .map((entry) => (
                        <tr key={`${entry.repoScope}-non-deep`}>
                          <td className="admin-table_path">{entry.repoScope}</td>
                          <td>{entry.nonDeepCachedPages}</td>
                          <td>{formatTtlSeconds(entry.nonDeepTtlSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </>
        )}
      </div>
    </section>
  );
}

function HomePage({
  backendStatus,
}: {
  backendStatus: 'checking' | 'ok' | 'degraded' | 'unreachable';
}) {
  const [repo, setRepo] = useState('');
  const [feedType, setFeedType] = useState<FeedType>('commits');
  const [commitFilters, setCommitFilters] = useState<CommitFiltersState>({ branches: '' });
  const [issuesState, setIssuesState] = useState<ItemState>('all');
  const [pullsState, setPullsState] = useState<ItemState>('all');
  const [allFeed, setAllFeed] = useState<AllFeedState>({
    commits: true,
    issues: true,
    issuesState: 'all',
    pulls: true,
    pullsState: 'all',
    releases: true,
  });
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleGenerate = () => {
    const err = validateForm(repo, feedType, allFeed);
    if (err) {
      setValidationError(err);
      setGeneratedUrl(null);
      return;
    }
    setValidationError(null);
    setGeneratedUrl(buildRssUrl(repo, feedType, commitFilters, allFeed, issuesState, pullsState));
  };

  const handleRepoChange = (value: string) => {
    setRepo(value);
    if (validationError) {
      setValidationError(null);
    }
    setGeneratedUrl(null);
  };

  const handleFeedTypeChange = (type: FeedType) => {
    setFeedType(type);
    setGeneratedUrl(null);
    setValidationError(null);
  };

  return (
    <main className="app-main">
      <div className="card">
        <RepoInput value={repo} onChange={handleRepoChange} />
        <FeedTypeSelector value={feedType} onChange={handleFeedTypeChange} />

        {feedType === 'commits' && (
          <CommitFilters value={commitFilters} onChange={setCommitFilters} />
        )}

        {feedType === 'issues' && (
          <StateFilter label="Status" value={issuesState} onChange={setIssuesState} />
        )}

        {feedType === 'pulls' && (
          <StateFilter label="Status" value={pullsState} onChange={setPullsState} />
        )}

        {feedType === 'all' && (
          <AllFeedOptions value={allFeed} onChange={setAllFeed} />
        )}

        {validationError && (
          <p className="error-msg" role="alert">{validationError}</p>
        )}

        <button
          className="btn btn--primary"
          onClick={handleGenerate}
          type="button"
          disabled={backendStatus === 'unreachable'}
          title={backendStatus === 'unreachable' ? 'Backend is offline' : backendStatus === 'degraded' ? 'Some backend services are degraded' : undefined}
        >
          Generate RSS Feed
        </button>
      </div>

      {generatedUrl && <RssOutput key={generatedUrl} url={generatedUrl} />}
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => normalizeRoute(window.location.pathname));
  const backendStatus = useBackendHealth();

  useEffect(() => {
    const onPopState = () => setRoute(normalizeRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <div className={`app ${route === '/api-docs' ? 'app--wide' : ''}`}>
      <header className="app-header">
        <div className="header-top">
          <h1 className="app-title">GitRSS</h1>
          <span className={`status-badge status-badge--${backendStatus}`}>
            {statusLabel[backendStatus]}
          </span>
        </div>
        <p className="app-subtitle">Generate RSS feeds for GitHub repositories</p>
        <HeaderNav route={route} />
      </header>

      {route === '/' && <HomePage backendStatus={backendStatus} />}
      {route === '/admin' && <AdminPage />}
      {route === '/faq' && <FaqPage />}
      {route === '/terms' && <TermsPage />}
      {route === '/api-docs' && <ApiDocsPage />}
      <FooterNav />
    </div>
  );
}
