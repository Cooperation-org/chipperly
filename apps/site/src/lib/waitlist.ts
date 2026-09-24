export type WaitlistState = { status: 'idle' | 'ok' | 'error'; message?: string };

const ROLES = ['caregiver', 'professional', 'self', 'other'] as const;
type Role = (typeof ROLES)[number];

// Pure validation for the waitlist form, kept out of the server action so
// it can be tested without a database (waitlist.test.ts).
export function checkWaitlist(form: FormData):
  | { error: string }
  | { bot: true }
  | { bot: false; email: string; data: { email: string; name?: string; role?: Role; source?: string } } {
  if (String(form.get('company') ?? '')) return { bot: true };
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }
  const name = String(form.get('name') ?? '').trim().slice(0, 100) || undefined;
  const roleRaw = String(form.get('role') ?? '');
  const role = (ROLES as readonly string[]).includes(roleRaw) ? (roleRaw as Role) : undefined;
  const source = String(form.get('source') ?? '').slice(0, 200) || undefined;
  return { bot: false, email, data: { email, name, role, source } };
}
