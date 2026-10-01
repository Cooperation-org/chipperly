import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportError, resetReportedCount } from './reportError';

describe('reportError', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

  beforeEach(() => {
    resetReportedCount();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { pathname: '/activity/edit/', search: '?id=secret' } });
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the message, stack and path, and never the query string', () => {
    reportError(new Error('x is not a function'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/client-errors$/);
    const body = JSON.parse(String(init.body)) as { message: string; path: string; stack?: string };
    expect(body.message).toBe('x is not a function');
    expect(body.path).toBe('/activity/edit/');
    expect(String(init.body)).not.toContain('secret');
  });

  it('stops after five reports in one page load', () => {
    for (let i = 0; i < 8; i += 1) reportError(new Error(`boom ${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('ignores network trouble and anything raised while offline', () => {
    reportError(new TypeError('Failed to fetch'));
    reportError(Object.assign(new Error('That took too long'), { name: 'TimeoutError' }));
    vi.stubGlobal('navigator', { onLine: false });
    reportError(new Error('real bug, but offline'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
