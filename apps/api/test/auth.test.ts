import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { TokensResponse } from '@chipperly/shared/schemas/auth';
import { buildTestApp, request } from './helpers.js';
import { getLastMailMessage } from '../src/lib/mailer.js';
import { isValidInviteCode } from '../src/routes/auth.js';

function extractToken(mailText: string): string {
  const match = mailText.match(/token=(\S+)/);
  if (!match) throw new Error(`no token found in mail text: ${mailText}`);
  return match[1];
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
      payload: { email: 'Parent@Example.com', password: 'correct-horse', display_name: 'Sam' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as TokensResponse;
    expect(typeof body.access_token).toBe('string');
    expect(typeof body.refresh_token).toBe('string');
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(900);
  });

  it('rejects a duplicate registration with 409 email_taken', async () => {
    await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'dup@example.com', password: 'correct-horse', display_name: 'Dup' },
    });
    const response = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'dup@example.com', password: 'another-password', display_name: 'Dup Two' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('email_taken');
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'login@example.com', password: 'correct-horse', display_name: 'Login' },
    });

    const ok = await request(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'correct-horse' },
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as TokensResponse).access_token).toBeTruthy();

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
      payload: { email: 'refresh@example.com', password: 'correct-horse', display_name: 'Refresh' },
    });
    const tokens = registered.json() as TokensResponse;

    const rotated = await request(app, {
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refresh_token: tokens.refresh_token },
    });
    expect(rotated.statusCode).toBe(200);
    const rotatedTokens = rotated.json() as TokensResponse;
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
      payload: { email: 'logout@example.com', password: 'correct-horse', display_name: 'Logout' },
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
      payload: { email: 'forgot@example.com', password: 'correct-horse', display_name: 'Forgot' },
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
      payload: { email: 'verify@example.com', password: 'correct-horse', display_name: 'Verify' },
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
    expect(response.json()).toEqual({ google: false, apple: false, invite_code_required: false });
  });

  // env.BETA_INVITE_CODE is unset for this test run (apps/api/test/globalSetup.ts doesn't set it), so
  // registration here stays open; the gated 403/bypass paths (wrong code, right code, invite_token bypass)
  // are exercised in e2e/specs/auth.spec.ts against a server started with BETA_INVITE_CODE set, since
  // env.ts parses process.env once at import and can't be flipped per-test in-process.
  it('registers without an invite_code when no beta code is configured', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'no-invite-code@example.com', password: 'correct-horse', display_name: 'Open Beta' },
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
