// Recovery: set an editor's password and clear a login lockout.
//   RESET_EMAIL=... RESET_PASSWORD=... pnpm -F @chipperly/site reset-admin
// Add CLOUDFLARE_ENV=remote CLOUDFLARE_REMOTE_BINDINGS=1 for the live site.
import config from '@payload-config';
import { getPayload } from 'payload';

const email = process.env.RESET_EMAIL;
const password = process.env.RESET_PASSWORD;
if (!email || !password) throw new Error('Set RESET_EMAIL and RESET_PASSWORD');

const payload = await getPayload({ config });
const { docs } = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true });
if (!docs[0]) throw new Error(`No user ${email}`);
await payload.update({ collection: 'users', id: docs[0].id, data: { password }, overrideAccess: true });
await payload.db.updateOne({ collection: 'users', where: { id: { equals: docs[0].id } }, data: { loginAttempts: 0, lockUntil: null } });
payload.logger.info(`Password reset for ${email}`);
process.exit(0);
