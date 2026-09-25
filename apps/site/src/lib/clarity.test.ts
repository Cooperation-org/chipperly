import { describe, expect, it } from 'vitest';
import { clarityScript } from './clarity';

const LIVE = 'https://chipperlyapp.com';

describe('clarityScript', () => {
  it('returns the snippet for the live domain, locked to that host in the browser', () => {
    const code = clarityScript('ynqc1d26iw', LIVE, 'production')!;
    expect(code).toContain('"ynqc1d26iw"');
    expect(code).toContain('h!=="chipperlyapp.com"&&h!=="www.chipperlyapp.com"');
    expect(clarityScript('ynqc1d26iw', 'https://www.chipperlyapp.com', 'production')).toBe(code);
  });

  it('the browser guard stops it on any other host', () => {
    const code = clarityScript('ynqc1d26iw', LIVE, 'production')!;
    const run = (hostname: string) => {
      let inserted = false;
      const doc = { createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore: () => (inserted = true) } }] };
      new Function('window', 'document', 'location', code)({}, doc, { hostname });
      return inserted;
    };
    expect(run('chipperlyapp.com')).toBe(true);
    expect(run('www.chipperlyapp.com')).toBe(true);
    for (const h of ['localhost', '127.0.0.1', '192.168.100.6', 'demos.linkedtrust.us']) expect(run(h)).toBe(false);
  });

  it('is off in development', () => {
    expect(clarityScript('ynqc1d26iw', LIVE, 'development')).toBeNull();
  });

  it('is off when the site URL is local, even in a production build', () => {
    for (const url of ['http://localhost:3100', 'http://127.0.0.1:3100', 'http://192.168.100.6:3100', 'http://10.0.0.5', 'http://chipperly.local']) {
      expect(clarityScript('ynqc1d26iw', url, 'production')).toBeNull();
    }
  });

  it('rejects a missing ID or one that could break out of the script', () => {
    expect(clarityScript(null, LIVE, 'production')).toBeNull();
    expect(clarityScript('x");alert(1);//', LIVE, 'production')).toBeNull();
  });
});
