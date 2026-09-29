import type { Metadata } from 'next';
import styles from '../legal.module.css';

const description = 'What Chipperly stores about you and the people you support, where it lives, and who can see it.';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description,
  alternates: { canonical: '/privacy/' },
  openGraph: {
    title: 'Privacy policy · Chipperly',
    description,
    url: '/privacy/',
    type: 'website',
  },
};

/** Plain-language draft privacy policy (SOW Q21 / COPPA). Server Component: static, indexable. */
export default function PrivacyPage() {
  return (
    <article className={styles.page}>
      <p className={styles.banner} role="status">
        Draft: to be reviewed by Chipperly&apos;s counsel before launch.
      </p>
      <h1 className={styles.title}>Privacy policy</h1>
      <p className={styles.updated}>Last updated 18 September 2026.</p>

      <p>
        Chipperly helps a family or support team build visual schedules, chip boards, and social
        stories for the person they support, or for their own day. This page explains what we
        store, where it lives, and who can see it.
      </p>

      <h2>What we store</h2>
      <p>
        For you: your name, email, and password (stored as a hash, never in plain text). For each
        profile a parent or team member sets up: a name, a picture, daily schedules and
        routines, rewards and chip totals, social stories, and mood check-ins entered by an adult.
        We don&apos;t collect anything directly from a child; every entry comes from the parent or
        team member who set up the profile.
      </p>

      <h2>Where it lives</h2>
      <p>
        On our own server, not a third party&apos;s. Photos and videos are compressed on upload and
        stored there too, backed up regularly. Nothing is sold or shared with data brokers or
        advertisers.
      </p>

      <h2>Who can see it</h2>
      <p>
        The parent or admin who creates a profile, and any team member that
        admin invites by email (a therapist, teacher, or co-parent, for example). An admin can
        also turn on a read-only link to share today&apos;s schedule with someone outside the app;
        that link shows nothing else. Nobody else can see a profile&apos;s data.
      </p>

      <h2>Analytics and ads</h2>
      <p>
        No analytics run inside the app itself, not even anonymous ones. We don&apos;t use a
        child&apos;s data to train any model, and we don&apos;t show ads, ever. Our public pages
        (this one, the sign-in screen) may use ordinary site analytics to see how many people visit;
        that never touches a signed-in account.
      </p>

      <h2>Your controls</h2>
      <p>
        From Settings, Account, you can download everything stored about you and the profiles you
        manage as one file, or delete your account and everything in it. Deleting an account
        removes its data from our server; it doesn&apos;t remove data other team members still
        rely on for a shared profile.
      </p>

      <h2>Children under 13</h2>
      <p>
        Accounts are held by adults, for their own day or on behalf of someone they support; a
        child under 13 never signs up directly. Creating an account requires confirming
        you&apos;re 18 or older and setting Chipperly up for yourself or for someone you&apos;re
        authorized to support.
      </p>

      <h2>Questions</h2>
      <p>
        Write to <a href="mailto:privacy@chipperlyapp.com">privacy@chipperlyapp.com</a> with any
        question about this policy or your data.
      </p>
    </article>
  );
}
