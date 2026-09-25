import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';

const description = 'The plain-language terms for using Chipperly.';

export const metadata: Metadata = {
  title: 'Terms',
  description,
  alternates: { canonical: '/terms/' },
  openGraph: {
    title: 'Terms · Chipperly',
    description,
    url: '/terms/',
    type: 'website',
  },
};

/** Plain-language draft terms of use (SOW Q21). Server Component: static, indexable. */
export default function TermsPage() {
  return (
    <article className={styles.page}>
      <p className={styles.banner} role="status">
        Draft: to be reviewed by Chipperly&apos;s counsel before launch.
      </p>
      <h1 className={styles.title}>Terms</h1>
      <p className={styles.updated}>Last updated 18 September 2026.</p>

      <p>
        These are the terms for using Chipperly. By creating an account, you agree to them. Read
        our <Link href="/privacy/">privacy policy</Link> too; it explains what we store and who can
        see it.
      </p>

      <h2>Who can use Chipperly</h2>
      <p>
        You must be a parent, guardian, or another adult authorised to support the child, and 18 or older, to create an
        account. You&apos;re responsible for what you and anyone you invite to your team enter
        about a child you support.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your password private and tell us if you think someone else has access to your
        account. You can delete your account at any time from Settings, Account.
      </p>

      <h2>What you can&apos;t do</h2>
      <p>
        Don&apos;t use Chipperly to store data about a child you don&apos;t have the right to care
        for, upload anything illegal or harmful, or try to break into another account or our
        systems.
      </p>

      <h2>The app as it is</h2>
      <p>
        Chipperly is provided as it is, without a guarantee that it will be free of bugs or always
        available. We work to keep your data safe and the app running, but we can&apos;t promise
        perfection.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as the app changes. If we make a change that matters, we&apos;ll
        let you know inside the app.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using Chipperly and delete your account whenever you want. We may suspend an
        account that breaks these terms.
      </p>

      <h2>Questions</h2>
      <p>
        Write to <a href="mailto:hello@chipperlyapp.com">hello@chipperlyapp.com</a> with any
        question about these terms.
      </p>
    </article>
  );
}
