import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../src/db/client.js';
import { users } from '../src/db/schema/accounts.js';
import { issueTokens, revokeSession, rotateRefreshToken, verifyAccessToken } from '../src/lib/tokens.js';
import { AppError } from '../src/plugins/errors.js';

async function createTestUser(): Promise<string> {
  const userId = uuidv7();
  await db.insert(users).values({
    id: userId,
    email: `${userId}@example.com`,
    display_name: 'Test User',
    created_at: Date.now(),
  });
  return userId;
}

describe('tokens', () => {
  it('issues an access token that verifies back to the same user', async () => {
    const userId = await createTestUser();
    const tokens = await issueTokens(userId);
    const payload = await verifyAccessToken(tokens.access_token);
    expect(payload.sub).toBe(userId);
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(900);
  });

  it('rotates a refresh token and rejects reuse of the old one', async () => {
    const userId = await createTestUser();
    const first = await issueTokens(userId);
    const rotated = await rotateRefreshToken(first.refresh_token);
    expect(rotated.refresh_token).not.toBe(first.refresh_token);
    await expect(rotateRefreshToken(first.refresh_token)).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a refresh token once its session is revoked', async () => {
    const userId = await createTestUser();
    const tokens = await issueTokens(userId);
    const payload = await verifyAccessToken(tokens.access_token);
    await revokeSession(payload.sid);
    await expect(rotateRefreshToken(tokens.refresh_token)).rejects.toBeInstanceOf(AppError);
  });
});
