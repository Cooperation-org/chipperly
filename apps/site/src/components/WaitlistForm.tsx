'use client';

import { useActionState } from 'react';
import { usePathname } from 'next/navigation';
import { joinWaitlist } from '../app/(site)/actions';
import type { WaitlistState } from '../lib/waitlist';

export function WaitlistForm({ appUrl }: { appUrl: string }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, { status: 'idle' });
  const path = usePathname();

  if (state.status === 'ok') {
    return (
      <div className="waitlist-done" role="status">
        <p className="waitlist-done-title">You are on the list.</p>
        <p>
          We will email you when Chipperly opens. Want to look around now?{' '}
          <a href={`${appUrl}/sign-up/`}>Try the app</a>.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="waitlist" aria-describedby="waitlist-msg">
      <input type="hidden" name="source" value={path} />
      {/* Honeypot: hidden from people and screen readers, bots fill it. */}
      <div className="hp" aria-hidden="true">
        <label>
          Company <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="waitlist-row">
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" maxLength={254} />
        </label>
        <label className="field">
          <span>
            I am a <span className="optional">(optional)</span>
          </span>
          <select name="role" defaultValue="">
            <option value="">Choose one</option>
            <option value="caregiver">Parent or caregiver</option>
            <option value="professional">Teacher or therapist</option>
            <option value="self">Neurodivergent adult</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <div className="waitlist-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Adding you…' : 'Join the waitlist'}
        </button>
        <a className="btn btn-ghost" href={`${appUrl}/sign-up/`}>
          Or try the app now
        </a>
      </div>
      <p id="waitlist-msg" className="waitlist-msg" role="alert">
        {state.status === 'error' ? state.message : ''}
      </p>
      <p className="fine">We only use your email to tell you about Chipperly&rsquo;s launch.</p>
    </form>
  );
}
