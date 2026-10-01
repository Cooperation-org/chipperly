// Add-only drop box for the nightly backups from the Contabo server
// (deploy/contabo/backup.sh), in front of the R2 bucket chipperly-app-backups.
//
// The server holds a secret that can add a file and nothing else: it cannot
// list, read, replace or delete. A break-in on the server therefore cannot
// destroy the backup history. Files expire through the bucket's lifecycle
// rule (30 days), not through this code.
//
// ponytail: one request per file, so a file must stay under the Workers
// request limit (100 MB). The uploads tar was 3 MB in Oct 2026; when it nears
// 90 MB, move to an S3 multipart upload with a bucket-scoped R2 token.
const KEY = /^(db|uploads)-\d{4}-\d{2}-\d{2}T\d{4}\.(dump|tar\.gz)$/;

function sameSecret(given, expected) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async fetch(request, env) {
    const auth = request.headers.get('authorization') ?? '';
    if (!env.BACKUP_SECRET || !sameSecret(auth, `Bearer ${env.BACKUP_SECRET}`)) {
      return new Response('unauthorized\n', { status: 401 });
    }
    const key = new URL(request.url).pathname.slice(1);
    if (request.method !== 'PUT' || !KEY.test(key) || !request.body) {
      return new Response('bad request\n', { status: 400 });
    }
    // Never replace: an existing backup stays as it was written.
    if (await env.BUCKET.head(key)) return new Response('exists\n', { status: 409 });
    const stored = await env.BUCKET.put(key, request.body);
    return new Response(`stored ${key} ${stored.size}\n`, { status: 201 });
  },
};
