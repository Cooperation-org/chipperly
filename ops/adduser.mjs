// Adds a person to the panel's own sign-in, or resets them (new password and authenticator key).
//   sudo -u ops node /opt/ops/adduser.mjs someone@example.com
// Prints the password and the authenticator key once; nothing else keeps them in plain text.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { base32, createAuth, hashPassword } from './auth.mjs';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('usage: node adduser.mjs someone@example.com');
  process.exit(1);
}
const auth = createAuth(path.join(process.env.OPS_DATA_DIR || '/var/lib/ops', 'users.json'));
const password = randomBytes(15).toString('base64url');
const secret = base32(randomBytes(20));
auth.save([...auth.load().filter((u) => u.email.toLowerCase() !== email.toLowerCase()), { email, password: hashPassword(password), totp: secret }]);
console.log(`${email} can sign in to ops.chipperlyapp.com.
  password:          ${password}
  authenticator key: ${secret}
  (or open: otpauth://totp/Chipperly%20Ops:${encodeURIComponent(email)}?secret=${secret}&issuer=Chipperly%20Ops)`);
