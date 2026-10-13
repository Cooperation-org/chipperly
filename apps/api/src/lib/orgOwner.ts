import { and, eq, gt, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { OrgType } from '@chipperly/shared/schemas/org';
import { db } from '../db/client.js';
import { account_members, accounts, invites } from '../db/schema/accounts.js';
import { insertInvite } from '../routes/accounts.js';
import { siteOrigin } from './emailTemplate.js';

/**
 * Creates an organization for someone else to own (admin site). `createdBy` is only a placeholder
 * owner and gets no account_members row, so they cannot open the account. The owner invite is not
 * mailed here; the caller sends `inviteUrl`. Accepting it (POST /invites/:token/accept) makes the
 * accepter admin and owner.
 */
export async function createOrgWithOwnerInvite(params: {
  name: string;
  ownerEmail: string;
  ownerName: string;
  createdBy: string;
  orgType?: OrgType;
}): Promise<{ accountId: string; inviteId: string; inviteUrl: string }> {
  const accountId = uuidv7();
  await db.insert(accounts).values({
    id: accountId,
    kind: 'agency',
    name: params.name,
    created_at: Date.now(),
    owner_user_id: params.createdBy,
    org_type: params.orgType ?? null,
  });
  const { invite, rawToken } = await insertInvite({
    accountId,
    inviterId: params.createdBy,
    email: params.ownerEmail,
    role: 'admin',
    profileIds: [],
    makesOwner: true,
    ownerName: params.ownerName,
  });
  return { accountId, inviteId: invite.id, inviteUrl: `${siteOrigin()}/invite/?token=${rawToken}` };
}

/** True while the account has an open (unaccepted, unexpired) owner invite and nobody has joined. */
export async function orgOwnerPending(accountId: string): Promise<boolean> {
  const [member] = await db.select({ id: account_members.user_id }).from(account_members).where(eq(account_members.account_id, accountId)).limit(1);
  if (member) return false;
  const [open] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.account_id, accountId), eq(invites.makes_owner, true), isNull(invites.accepted_at), gt(invites.expires_at, Date.now())))
    .limit(1);
  return !!open;
}
