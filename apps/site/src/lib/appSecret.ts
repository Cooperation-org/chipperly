// The admin site (the app's API) reads and marks the waitlist with ADMIN_LINK_SECRET,
// the same value on both sides and used for nothing else. Constant-time compare; unset = refused.
export function fromApp(req: Request): boolean {
  const want = process.env.ADMIN_LINK_SECRET ?? '';
  const got = req.headers.get('x-admin-link') ?? '';
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
