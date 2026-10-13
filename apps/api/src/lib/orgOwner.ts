// STUB until chipperly-38's real lib/orgOwner.ts reaches main (stage 3 invites).
// On merge, keep their file and delete this one. Agreed signature, 13 Oct 2026:
// an agency account with owner_user_id = createdBy as a placeholder and no
// member row for them, plus an admin invite marked makes_owner; accepting it
// makes the accepter the owner.
import { v7 as uuidv7 } from 'uuid';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';

export async function createOrgWithOwnerInvite(o: {
  name: string;
  ownerEmail: string;
  ownerName: string;
  createdBy: string;
  orgType?: string;
}): Promise<{ accountId: string; inviteId: string; inviteUrl: string }> {
  const accountId = uuidv7();
  await db.insert(accounts).values({ id: accountId, kind: 'agency', name: o.name, created_at: Date.now(), owner_user_id: o.createdBy });
  const inviteId = uuidv7();
  return { accountId, inviteId, inviteUrl: `https://app.chipperlyapp.com/invite/?token=stub-${inviteId}` };
}

export async function orgOwnerPending(_accountId: string): Promise<boolean> {
  return false;
}
