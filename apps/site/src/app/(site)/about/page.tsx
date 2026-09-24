/* eslint-disable @next/next/no-img-element */
import { Crumbs } from '../../../components/Crumbs';
import { JsonLd } from '../../../components/JsonLd';
import { AUDIENCES } from '../../../lib/content';
import { breadcrumbs, founder } from '../../../lib/jsonld';
import { buildMetadata } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Our Story',
  description:
    'Chipperly was built by Taymar Pixleysmith, a Tucson mom who could not find one app with every visual support her son needed. So she made it.',
  path: '/about',
});

const STORY = [
  {
    title: 'The struggle',
    text: 'Neurodivergence can make daily tasks like communication, emotional regulation and organization hard for individuals and their families. For Taymar, watching her son Benny struggle while knowing the right tools could help was heartbreaking.',
  },
  {
    title: 'The epiphany',
    text: 'Visual supports help, but traditional tools are low-tech, need crafting skills, and pieces get lost. Existing apps are expensive, clunky, and each solves only one or two pieces of the puzzle. She needed everything in one place, open to everyone who supports Benny.',
  },
  {
    title: 'The solution',
    text: 'Chipperly puts every visual support tool in one app that is easy to create, customize and share with the whole care team. No more hunting for lost pieces or juggling four different subscriptions.',
  },
];

export default function About() {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <Crumbs items={[['About']]} />
          <p className="eyebrow">Our story</p>
          <h1>From frustration to empowerment</h1>
          <p className="lede">Born from a mother&rsquo;s love, built for the neurodivergent community.</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }} aria-label="How Chipperly started">
        <div className="wrap steps">
          {STORY.map((s) => (
            <article key={s.title} className="step">
              <h2 className="h3" style={{ fontSize: 'var(--h3)' }}>
                {s.title}
              </h2>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section sand" aria-label="From the founder">
        <div className="wrap founder">
          <img className="founder-mark" src="/brand/mark.svg" alt="" aria-hidden="true" />
          <figure>
            <blockquote>
              &ldquo;It&rsquo;s not me, it&rsquo;s you! One day I realized I wasn&rsquo;t the failure. It was the tools that
              were failing me and my son Benny both.&rdquo;
            </blockquote>
            <figcaption>Taymar Pixleysmith, Founder &amp; CEO</figcaption>
          </figure>
        </div>
      </section>

      <section className="section" aria-labelledby="for-title">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Who we&rsquo;re for</p>
            <h2 id="for-title">Neurodivergent people and everyone who supports them</h2>
          </div>
          <div className="cards">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="card">
                <h3>{a.title}</h3>
                <p>{a.text}</p>
              </div>
            ))}
          </div>
          <p className="lede" style={{ marginTop: 40 }}>
            Chipperly LLC was founded in Tucson, Arizona. Questions or ideas? Write to us at{' '}
            <a href="mailto:info@chipperlyapp.com">info@chipperlyapp.com</a>.
          </p>
        </div>
      </section>

      <JsonLd graph={[founder(), breadcrumbs([['About', '/about']])]} />
    </>
  );
}
