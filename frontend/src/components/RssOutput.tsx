import { useState } from 'react';
import { useRssPreview } from '../hooks/useRssPreview';

interface Props {
  url: string;
}

export function RssOutput({ url }: Props) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { loading, content, error, itemCount, fetchPreview, clearPreview } = useRssPreview();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTogglePreview = () => {
    if (showPreview) {
      setShowPreview(false);
      clearPreview();
    } else {
      setShowPreview(true);
      void fetchPreview(url);
    }
  };

  return (
    <div className="output-section">
      <span className="label">Generated RSS URL</span>

      <div className="url-bar">
        <a href={url} target="_blank" rel="noopener noreferrer" className="url-text">
          {url}
        </a>
        <button className="btn btn--sm" onClick={handleCopy} type="button">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="preview-actions">
        <button className="btn btn--ghost btn--sm" onClick={handleTogglePreview} type="button">
          {showPreview ? 'Hide preview' : 'Preview feed'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--ghost btn--sm"
        >
          Open in browser ↗
        </a>
      </div>

      {showPreview && (
        <div className="preview-box">
          {loading && (
            <p className="preview-status">
              <span className="spinner" aria-hidden="true" /> Fetching feed...
            </p>
          )}

          {error && (
            <p className="preview-status preview-status--error" role="alert">
              {error}
            </p>
          )}

          {content && !error && (
            <>
              <p className="preview-meta">
                {itemCount === 0
                  ? 'Feed is valid but contains no items yet.'
                  : `${itemCount ?? '?'} item${itemCount === 1 ? '' : 's'} found`}
              </p>
              <pre className="preview-content">{content}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
