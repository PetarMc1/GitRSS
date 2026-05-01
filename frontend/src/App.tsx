import { useEffect, useMemo, useState } from 'react';
import SwaggerUI from 'swagger-ui-react';
import { AllFeedOptions } from './components/AllFeedOptions';
import { CommitFilters } from './components/CommitFilters';
import { FeedTypeSelector } from './components/FeedTypeSelector';
import { RepoInput } from './components/RepoInput';
import { RssOutput } from './components/RssOutput';
import { useBackendHealth } from './hooks/useBackendHealth';
import { buildRssUrl } from './hooks/useRssUrl';
import type { AllFeedState, CommitFiltersState, FeedType } from './types';
import { validateForm } from './utils/validation';
import 'swagger-ui-react/swagger-ui.css';
import './App.css';

const STATUS_LABEL: Record<string, string> = {
  checking: 'Backend: checking…',
  ok: 'Backend: online',
  unreachable: 'Backend: offline',
};

const LAST_UPDATED = '2026-04-26';

type AppRoute = '/' | '/faq' | '/terms' | '/api-docs';

const OPENAPI_SPEC_URL = new URL('./docs/openapi.json', import.meta.url).href;

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

const FAQ_ITEMS: FaqItem[] = [
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

const TERMS_SECTIONS: TermsSection[] = [
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
      <p className="static-page_updated">Last updated: {LAST_UPDATED}</p>
      <p>These Terms of Service govern access to and use of this GitRSS service.</p>

      <ol className="terms-list">
        {TERMS_SECTIONS.map((section) => (
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
          url={OPENAPI_SPEC_URL}
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
      return FAQ_ITEMS;
    }

    return FAQ_ITEMS.filter((item) => {
      const haystack = `${item.question} ${item.answer}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  return (
    <section className="card static-page" aria-labelledby="faq-title">
      <h2 id="faq-title" className="static-page_title">FAQ</h2>
      <p className="static-page_updated">Last updated: {LAST_UPDATED}</p>
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

function HomePage({
  backendStatus,
}: {
  backendStatus: 'checking' | 'ok' | 'unreachable';
}) {
  const [repo, setRepo] = useState('');
  const [feedType, setFeedType] = useState<FeedType>('commits');
  const [commitFilters, setCommitFilters] = useState<CommitFiltersState>({ branches: '' });
  const [allFeed, setAllFeed] = useState<AllFeedState>({
    commits: true,
    issues: true,
    pulls: true,
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
    setGeneratedUrl(buildRssUrl(repo, feedType, commitFilters, allFeed));
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
          title={backendStatus === 'unreachable' ? 'Backend is offline' : undefined}
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
            {STATUS_LABEL[backendStatus]}
          </span>
        </div>
        <p className="app-subtitle">Generate RSS feeds for GitHub repositories</p>
        <HeaderNav route={route} />
      </header>

      {route === '/' && <HomePage backendStatus={backendStatus} />}
      {route === '/faq' && <FaqPage />}
      {route === '/terms' && <TermsPage />}
      {route === '/api-docs' && <ApiDocsPage />}
      <FooterNav />
    </div>
  );
}
