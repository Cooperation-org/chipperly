'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ApiError } from '@/lib/api/client';
import {
  BUSY_MESSAGE,
  mergeResults,
  searchImages,
  type ImageResult,
} from '@/lib/imageSearch';
import styles from './ImageSearchPanel.module.css';

export interface ImageSearchPanelProps {
  initialQuery: string;
  /** Imports and stores the picked result; throws if the download failed. */
  onPick: (result: ImageResult) => Promise<void>;
}

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) return BUSY_MESSAGE;
  return "Couldn't search right now. Check your connection and try again.";
}

/** Search box and thumbnail grid for openly licensed images. Searches on Enter or the button, never while typing. */
export function ImageSearchPanel({ initialQuery, onPick }: ImageSearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [searched, setSearched] = useState('');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  async function run(q: string, nextPage: number): Promise<void> {
    inFlight.current?.abort();
    const ctl = new AbortController();
    inFlight.current = ctl;
    setLoading(true);
    setError(null);
    try {
      const data = await searchImages(q, nextPage, ctl.signal);
      if (ctl.signal.aborted) return;
      setResults((prev) => (nextPage === 1 ? data.results : mergeResults(prev, data.results)));
      setTotal(data.total);
      setPageCount(data.page_count);
      setPage(nextPage);
      setSearched(q);
    } catch (err) {
      if (!ctl.signal.aborted) setError(errorText(err));
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    const q = query.trim();
    if (q) void run(q, 1);
  }

  async function pick(result: ImageResult): Promise<void> {
    setPickingId(result.id);
    setError(null);
    try {
      await onPick(result);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? BUSY_MESSAGE : "Couldn't get that image. Try another one.");
    } finally {
      setPickingId(null);
    }
  }

  const hasMore = page < pageCount;
  return (
    <div className={styles.panel}>
      <form className={styles.form} role="search" onSubmit={onSubmit}>
        <input
          type="search"
          className={styles.input}
          aria-label="Search for an image"
          placeholder="Search for an image"
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className={styles.go} disabled={loading || !query.trim()}>
          <Icon name="search" size={20} />
          Search
        </button>
      </form>
      <div role="status" className={styles.status}>
        {loading && page === 0 ? 'Searching...' : null}
        {error}
        {!loading && !error && searched && results.length === 0 ? `No images found for "${searched}". Try another word.` : null}
        {!error && results.length > 0 ? `${total.toLocaleString('en-US')} images found. Tap one to use it.` : null}
      </div>
      {results.length > 0 ? (
        <ul className={styles.grid}>
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={styles.thumb}
                onClick={() => void pick(r)}
                disabled={pickingId !== null}
                aria-busy={pickingId === r.id || undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- static export, remote Openverse thumbnail */}
                {r.thumbnail ? <img src={r.thumbnail} alt={r.title} loading="lazy" width={120} height={120} /> : <span>{r.title}</span>}
                <span className={styles.license}>{r.license}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hasMore ? (
        <button type="button" className={styles.more} onClick={() => void run(searched, page + 1)} disabled={loading}>
          {loading ? 'Loading...' : 'Load more'}
        </button>
      ) : null}
      <p className={styles.note}>Free to use images from Openverse. Credits are kept in Settings.</p>
    </div>
  );
}
