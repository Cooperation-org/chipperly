import { WaitlistForm } from './WaitlistForm';

export function CtaBand({ launched, appUrl, title = 'Be the first to try it' }: { launched: boolean; appUrl: string; title?: string }) {
  return (
    <section id="waitlist" className="cta-band" aria-labelledby="cta-title">
      <div className="wrap cta-inner">
        <div>
          <p className="eyebrow eyebrow-light">{launched ? 'Open now' : 'Launching soon'}</p>
          <h2 id="cta-title">{launched ? 'Start your first schedule today' : title}</h2>
          <p>
            {launched
              ? 'Create a free account and set up your first visual schedule in a few minutes.'
              : "We're putting the finishing touches on Chipperly. Leave your email and we'll tell you the moment it's ready."}
          </p>
        </div>
        {launched ? (
          <a className="btn btn-light" href={`${appUrl}/sign-up/`}>
            Get started
          </a>
        ) : (
          <WaitlistForm appUrl={appUrl} />
        )}
      </div>
    </section>
  );
}
