// node ops/auth.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { base32, checkPassword, createAuth, hashPassword, matchTotp, totp } from './auth.mjs';

// RFC 6238 test vector (SHA-1, secret "12345678901234567890", T=59s): 94287082, last 6 digits.
const rfc = base32(Buffer.from('12345678901234567890'));
assert.equal(rfc, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
assert.equal(totp(rfc, 1), '287082');
assert.equal(totp(rfc, 1, 8), '94287082');
assert.equal(matchTotp(rfc, '287082', 59_000), 1);
assert.equal(matchTotp(rfc, '287082', 59_000 + 30_000), 1, 'one step of drift is fine');
assert.equal(matchTotp(rfc, '287082', 59_000 + 90_000), null, 'three steps late is not');

const h = hashPassword('secret pw');
assert.ok(checkPassword('secret pw', h));
assert.ok(!checkPassword('Secret pw', h));
assert.ok(!checkPassword('x', 'garbage'));

let t = 1_000_000_000_000;
const auth = createAuth(path.join(mkdtempSync(path.join(tmpdir(), 'ops-')), 'users.json'), { now: () => t });
auth.save([{ email: 'Me@Example.com', password: hashPassword('pw-1'), totp: rfc }]);
const code = () => totp(rfc, Math.floor(t / 30_000));

assert.ok(auth.signIn({ email: 'me@example.com', password: 'pw-1', code: '000000' }, 'ip1').error, 'wrong code');
assert.ok(auth.signIn({ email: 'me@example.com', password: 'nope', code: code() }, 'ip1').error, 'wrong password');
assert.ok(auth.signIn({ email: 'who@example.com', password: 'pw-1', code: code() }, 'ip1').error, 'unknown person');
const ok = auth.signIn({ email: 'me@example.com', password: 'pw-1', code: code() }, 'ip2');
assert.equal(ok.email, 'Me@Example.com');
assert.equal(auth.user(ok.token), 'Me@Example.com');
assert.ok(auth.signIn({ email: 'me@example.com', password: 'pw-1', code: code() }, 'ip2').error, 'a code works once');

t += 13 * 3600_000;
assert.equal(auth.user(ok.token), null, 'sessions end after 12 hours');

for (let i = 0; i < 5; i++) auth.signIn({ email: 'me@example.com', password: 'bad', code: '1' }, 'ip3');
assert.match(auth.signIn({ email: 'me@example.com', password: 'pw-1', code: code() }, 'ip4').error, /Too many/, 'locked after 5 misses');
t += 16 * 60_000;
const back = auth.signIn({ email: 'me@example.com', password: 'pw-1', code: code() }, 'ip4');
assert.ok(back.token, 'unlocked after 15 minutes');
auth.signOut(back.token);
assert.equal(auth.user(back.token), null);
console.log('auth: all checks passed');
