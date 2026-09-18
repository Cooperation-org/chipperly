import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ProvidersResponseSchema, TokensResponseSchema, type TokensResponse } from '@chipperly/shared/schemas/auth';
import { buildTestApp, expectShape, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { invites, users } from '../src/db/schema/accounts.js';
import { getLastMailMessage } from '../src/lib/mailer.js';
import { issueTokens } from '../src/lib/tokens.js';
import { isValidInviteCode } from '../src/routes/auth.js';
import { env } from '../src/env.js';
import { verifyGoogleIdToken } from '../src/lib/google.js';

// No real Google JWKS call in tests: lib/google.ts's verifyGoogleIdToken is
// stubbed for the "new Google user" describe block below (no injectable
// verifier existed before this; a full DI seam felt like more than this
// needed, vi.mock does the same job in one line).
vi.mock('../src/lib/google.js', () => ({ verifyGoogleIdToken: vi.fn() }));

function extractToken(mailText: string): string {
  const match = mailText.match(/token=(\S+)/);
  if (!match) throw new Error(`no token found in mail text: ${mailText}`);
  return match[1];
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Mirrors test/accounts.test.ts's helper: a user row inserted directly, skipping the invite-gated /auth/register. */
async function createUser(label: string): Promise<{ id: string; token: string }> {
  const id = uuidv7();
  await db.insert(users).values({
    id,
    email: `${label}-${id}@example.com`,
    display_name: `${label} tester`,
    created_at: Date.now(),
  });
  const tokens = await issueTokens(id);
  return { id, token: tokens.access_token };
}

describe('auth routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user and returns a tokens response', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'Parent@Example.com', password: 'correct-horse', display_name: 'Sam', consented_at: Date.now() },
    });
    expect(response.statusCode).toBe(200);
    const body = expectShape(response, TokensResponseSchema);
    expect(typeof body.access_token).toBe('string');
    expect(typeof body.refresh_token).toBe('string');
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(900);
  });

  it('rejects a duplicate registration with 409 email_taken', async () => {
    await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'dup@example.com', password: 'correct-horse', display_name: 'Dup', consented_at: Date.now() },
    });
    const response = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'dup@example.com', password: 'another-password', display_name: 'Dup Two', consented_at: Date.now() },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('email_taken');
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'login@example.com', password: 'correct-horse', display_name: 'Login', consented_at: Date.now() },
    });

    const ok = await request(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'correct-horse' },
    });
    expect(ok.statusCode).toBe(200);
    expect(expectShape(ok, TokensResponseSchema).access_token).toBeTruthy();

    const wrong = await request(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'wrong-password' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('invalid_credentials');

    const unknown = await request(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'whatever1' },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe('invalid_credentials');
  });

  it('rotates a refresh token and rejects the old one afterwards', async () => {
    const registered = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'refresh@example.com', password: 'correct-horse', display_name: 'Refresh', consented_at: Date.now() },
    });
    const tokens = registered.json() as TokensResponse;

    const rotated = await request(app, {
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refresh_token: tokens.refresh_token },
    });
    expect(rotated.statusCode).toBe(200);
    const rotatedTokens = expectShape(rotated, TokensResponseSchema);
    expect(rotatedTokens.refresh_token).not.toBe(tokens.refresh_token);

    const reused = await request(app, {
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refresh_token: tokens.refresh_token },
    });
    expect(reused.statusCode).toBe(401);
    expect(reused.json().error.code).toBe('invalid_refresh');
  });

  it('logs out and revokes the session so its refresh token stops working', async () => {
    const registered = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'logout@example.com', password: 'correct-horse', display_name: 'Logout', consented_at: Date.now() },
    });
    const tokens = registered.json() as TokensResponse;

    const logout = await request(app, {
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${tokens.access_token}` },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);

    const refreshAfterLogout = await request(app, {
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refresh_token: tokens.refresh_token },
    });
    expect(refreshAfterLogout.statusCode).toBe(401);
  });

  it('runs the forgot/reset password flow using the token from the console mailer', async () => {
    await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'forgot@example.com', password: 'correct-horse', display_name: 'Forgot', consented_at: Date.now() },
    });

    const forgot = await request(app, {
      method: 'POST',
      url: '/api/auth/password/forgot',
      payload: { email: 'forgot@example.com' },
    });
    expect(forgot.statusCode).toBe(200);
    expect(forgot.json()).toEqual({ ok: true });

    const mail = getLastMailMessage();
    expect(mail?.to).toBe('forgot@example.com');
    const token = extractToken(mail!.text);

    const reset = await request(app, {
      method: 'POST',
      url: '/api/auth/password/reset',
      payload: { token, password: 'new-password-1' },
    });
    expect(reset.statusCode).toBe(200);

    const loginOld = await request(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'forgot@example.com', password: 'correct-horse' },
    });
    expect(loginOld.statusCode).toBe(401);

    const loginNew = await request(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'forgot@example.com', password: 'new-password-1' },
    });
    expect(loginNew.statusCode).toBe(200);
  });

  it('emails a working verification link on register and verify consumes it', async () => {
    const registered = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'verify@example.com', password: 'correct-horse', display_name: 'Verify', consented_at: Date.now() },
    });
    expect(registered.statusCode).toBe(200);

    const mail = getLastMailMessage();
    expect(mail?.to).toBe('verify@example.com');
    const token = extractToken(mail!.text);

    const verify = await request(app, { method: 'GET', url: `/api/auth/verify/${token}` });
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toEqual({ ok: true });

    const verifyAgain = await request(app, { method: 'GET', url: `/api/auth/verify/${token}` });
    expect(verifyAgain.statusCode).toBe(400);
    expect(verifyAgain.json().error.code).toBe('invalid_token');
  });

  it('reports provider availability from env', async () => {
    const response = await request(app, { method: 'GET', url: '/api/auth/providers' });
    expect(response.statusCode).toBe(200);
    expect(expectShape(response, ProvidersResponseSchema)).toEqual({
      google: false,
      apple: false,
      invite_code_required: false,
    });
  });

  // env.BETA_INVITE_CODE is unset for this test run (apps/api/test/globalSetup.ts doesn't set it), so
  // registration here stays open; the gated 403/bypass paths (wrong code, right code, invite_token bypass)
  // are exercised in e2e/specs/auth.spec.ts against a server started with BETA_INVITE_CODE set, since
  // env.ts parses process.env once at import and can't be flipped per-test in-process.
  it('registers without an invite_code when no beta code is configured', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'no-invite-code@example.com', password: 'correct-horse', display_name: 'Open Beta', consented_at: Date.now() },
    });
    expect(response.statusCode).toBe(200);
  });

  it('404s google and apple sign-in when disabled', async () => {
    const google = await request(app, {
      method: 'POST',
      url: '/api/auth/google',
      payload: { id_token: 'whatever' },
    });
    expect(google.statusCode).toBe(404);
    expect(google.json().error.code).toBe('not_enabled');

    const apple = await request(app, { method: 'POST', url: '/api/auth/apple', payload: { id_token: 'whatever' } });
    expect(apple.statusCode).toBe(404);
    expect(apple.json().error.code).toBe('not_enabled');
  });
});

describe('isValidInviteCode', () => {
  it('has nothing to check when no code is configured', () => {
    expect(isValidInviteCode(undefined, undefined)).toBe(true);
    expect(isValidInviteCode(undefined, 'anything')).toBe(true);
  });

  it('rejects a missing or wrong code, accepts the right one', () => {
    expect(isValidInviteCode('e2e-beta-code', undefined)).toBe(false);
    expect(isValidInviteCode('e2e-beta-code', 'wrong')).toBe(false);
    expect(isValidInviteCode('e2e-beta-code', 'e2e-beta-cod')).toBe(false);
    expect(isValidInviteCode('e2e-beta-code', 'e2e-beta-code')).toBe(true);
  });
});

// env.googleEnabled/env.BETA_INVITE_CODE are mutated directly around this block (see env.ts: the exported
// object's fields aren't readonly) instead of via globalSetup, so this doesn't flip the closed-beta gate
// for every other test file sharing this worker's module cache.
describe('POST /auth/google, new user, closed beta', () => {
  let app: FastifyInstance;
  let account: { id: string };
  let inviteToken: string;
  const originalGoogleEnabled = env.googleEnabled;
  const originalBetaCode = env.BETA_INVITE_CODE;

  beforeAll(async () => {
    app = await buildTestApp();
    env.googleEnabled = true;
    env.BETA_INVITE_CODE = 'e2e-google-beta-code';

    const admin = await createUser('google-admin');
    const accountRes = await request(app, {
      method: 'POST',
      url: '/api/accounts',
      headers: auth(admin.token),
      payload: { kind: 'household', name: 'Google beta household' },
    });
    account = (accountRes.json() as { account: { id: string } }).account;

    await request(app, {
      method: 'POST',
      url: `/api/accounts/${account.id}/invites`,
      headers: auth(admin.token),
      payload: { email: 'google-invitee@example.com', role: 'member', profile_ids: [] },
    });
    inviteToken = extractToken(getLastMailMessage()!.text);
  });

  afterAll(async () => {
    env.googleEnabled = originalGoogleEnabled;
    env.BETA_INVITE_CODE = originalBetaCode;
    await app.close();
  });

  it('rejects a brand-new Google sign-in with neither an invite_code nor an invite_token', async () => {
    vi.mocked(verifyGoogleIdToken).mockResolvedValueOnce({
      sub: 'google-sub-rejected',
      email: 'google-new-rejected@example.com',
      email_verified: true,
      name: 'Rejected Googler',
    });
    const response = await request(app, {
      method: 'POST',
      url: '/api/auth/google',
      payload: { id_token: 'stubbed' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('invite_code_invalid');
  });

  it('409s a brand-new Google sign-in with a valid invite_token but no consented_at', async () => {
    vi.mocked(verifyGoogleIdToken).mockResolvedValueOnce({
      sub: 'google-sub-no-consent',
      email: 'google-new-no-consent@example.com',
      email_verified: true,
      name: 'No Consent Googler',
    });
    const response = await request(app, {
      method: 'POST',
      url: '/api/auth/google',
      payload: { id_token: 'stubbed', invite_token: inviteToken },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('consent_required');
  });

  it('accepts a brand-new Google sign-in with a valid invite_token and consented_at, without marking the invite accepted', async () => {
    vi.mocked(verifyGoogleIdToken).mockResolvedValueOnce({
      sub: 'google-sub-accepted',
      email: 'google-new-accepted@example.com',
      email_verified: true,
      name: 'Accepted Googler',
    });
    const response = await request(app, {
      method: 'POST',
      url: '/api/auth/google',
      payload: { id_token: 'stubbed', invite_token: inviteToken, consented_at: Date.now() },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as TokensResponse).access_token).toBeTruthy();

    // Sign-in via the invite_token bypass isn't accepting the invite; only POST /invites/:token/accept does.
    const [inviteRow] = await db.select().from(invites).where(eq(invites.account_id, account.id));
    expect(inviteRow?.accepted_at).toBeNull();
  });
});

describe('register requires consent', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('400s registration without consented_at', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'no-consent@example.com', password: 'correct-horse', display_name: 'No Consent' },
    });
    expect(response.statusCode).toBe(400);
  });
});
