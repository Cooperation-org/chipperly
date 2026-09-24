/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { Icon } from '../../components/Icon';
import { JsonLd } from '../../components/JsonLd';
import { Phone } from '../../components/Phone';
import { PostCard } from '../../components/PostCard';
import { TOOLS } from '../../lib/content';
import { softwareApp } from '../../lib/jsonld';
import { getPosts, getSettings } from '../../lib/payload';
import { screens } from '../../lib/screens';
import { buildMetadata } from '../../lib/seo';
import { APP_URL, SITE_NAME } from '../../lib/site';

export const revalidate = 3600;

export const metadata = {
  ...buildMetadata({ path: '/' }),
  title: { absolute: `${SITE_NAME} - Visual Supports for Neurodivergent Individuals` },
};

export default async function Home() {
  const [settings, posts] = await Promise.all([getSettings(), getPosts()]);
  const latest = posts.docs.slice(0, 3);
  const launched = Boolean(settings.launched);

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Visual supports app</p>
            <h1>
              Visual supports made <span className="accent">simple</span> for everyone
            </h1>
            <p className="lede">
              The all-in-one app for neurodivergent individuals and their families: visual schedules, timers, chip boards
              and more, in one easy dashboard the whole care team can share.
            </p>
            <div className="hero-actions">
              {launched ? (
                <a className="btn btn-primary" href={`${APP_URL}/sign-up/`}>
                  Get started <Icon name="arrow" size={20} />
                </a>
              ) : (
                <a className="btn btn-primary" href="#waitlist">
                  Join the waitlist <Icon name="arrow" size={20} />
                </a>
              )}
              <Link className="btn btn-ghost" href="/features">
                See how it works
              </Link>
            </div>
            <p className="hero-note">Works on phones, tablets and computers, even offline.</p>
          </div>
          <div className="hero-art">
            <img className="hero-star" src="/brand/mark.svg" alt="" aria-hidden="true" />
            <div className="phone-pair">
              <Phone src={screens.childHome} alt="The child's home screen with big buttons: My Day, Chips, Free time and First, then." priority />
              <Phone src={screens.today} alt="The caregiver's Today screen with the day's schedule in pictures." priority />
            </div>
          </div>
        </div>
      </section>

      <section className="section sand" aria-labelledby="founder-title">
        <div className="wrap founder">
          <img className="founder-mark" src="/brand/mark.svg" alt="" aria-hidden="true" />
          <div>
            <p className="eyebrow">Built by a parent who gets it</p>
            <h2 id="founder-title" className="sr-only">
              Made out of necessity
            </h2>
            <figure>
              <blockquote>
                &ldquo;It&rsquo;s not me, it&rsquo;s you! One day I realized I wasn&rsquo;t the failure. It was the tools
                that were failing me and my son Benny both.&rdquo;
              </blockquote>
              <figcaption>Taymar Pixleysmith, Founder &amp; CEO</figcaption>
            </figure>
            <p className="lede" style={{ marginTop: 24 }}>
              Chipperly was created by a mom who couldn&rsquo;t find a single app that brought all the visual support
              tools her son needed into one place. So she built it.
            </p>
            <Link className="link-arrow" href="/about">
              Read our story <Icon name="arrow" size={20} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="tools-title">
        <div className="wrap">
          <div className="section-head center">
            <p className="eyebrow">Five tools, one dashboard</p>
            <h2 id="tools-title">Everything that used to live on laminated cards</h2>
            <p>Replace a pile of separate apps and paper tools with one simple app, shared with the whole care team.</p>
          </div>
          <div className="tools-grid">
            {TOOLS.map((t) => (
              <Link key={t.id} href={`/features#${t.id}`} className="tool-card">
                <span className="icon-chip">
                  <Icon name={t.icon} />
                </span>
                <h3>{t.title}</h3>
                <p>{t.short}</p>
              </Link>
            ))}
          </div>
        </div>
        <div className="strip" role="region" aria-label="App screens" tabIndex={0}>
          {TOOLS.map((t) => (
            <figure key={t.id}>
              <Phone src={t.screen} alt={t.alt} className="phone-sm" />
              <figcaption>{t.title}</figcaption>
            </figure>
          ))}
        </div>
        <div className="wrap" style={{ textAlign: 'center' }}>
          <Link className="link-arrow" href="/features">
            Explore all features <Icon name="arrow" size={20} />
          </Link>
        </div>
      </section>

      {latest.length > 0 && (
        <section className="section sand" aria-labelledby="blog-title">
          <div className="wrap">
            <div className="section-head">
              <p className="eyebrow">From the blog</p>
              <h2 id="blog-title">Ideas for calmer days</h2>
            </div>
            <div className="post-grid">
              {latest.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
            <p style={{ marginTop: 32 }}>
              <Link className="link-arrow" href="/blog">
                All posts <Icon name="arrow" size={20} />
              </Link>
            </p>
          </div>
        </section>
      )}

      <JsonLd graph={[softwareApp()]} />
    </>
  );
}
