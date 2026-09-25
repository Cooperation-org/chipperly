const LOCAL = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)|\.local$/;

// The Microsoft Clarity snippet for the live site, or null anywhere else.
// Two guards keep it off every copy that is not the real site:
//  - here: only in a production build whose site URL is a real domain;
//  - in the browser: the snippet only starts when the page is actually
//    served from that domain (or www.), so a production build run on a
//    laptop (localhost, a LAN IP) never records.
// The ID is checked because it is written into an inline script.
export function clarityScript(id: string | null | undefined, siteUrl: string, nodeEnv: string | undefined): string | null {
  if (!id || !/^[a-z0-9]{6,16}$/.test(id)) return null;
  if (nodeEnv !== 'production') return null;
  const host = new URL(siteUrl).hostname.replace(/^www\./, '');
  if (LOCAL.test(host)) return null;
  const ok = `h!==${JSON.stringify(host)}&&h!==${JSON.stringify(`www.${host}`)}`;
  return `(function(h){if(${ok})return;(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");})(location.hostname);`;
}
