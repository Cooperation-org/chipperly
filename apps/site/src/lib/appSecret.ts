// The admin site (the app's API) reads and marks the waitlist with its CRON_SECRET,
// which matches NEWSLETTER_API_SECRET here. Constant-time compare; unset = refused.
export function fromApp(req: Request): boolean {
  const want = process.env.NEWSLETTER_API_SECRET ?? '';
  const got = req.headers.get('x-cron-secret') ?? '';
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
