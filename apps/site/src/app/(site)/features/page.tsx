import { Crumbs } from '../../../components/Crumbs';
import { Icon } from '../../../components/Icon';
import { JsonLd } from '../../../components/JsonLd';
import { Phone } from '../../../components/Phone';
import { CARE_TEAM, FAQS, TOOLS } from '../../../lib/content';
import { breadcrumbs, faqPage, softwareApp } from '../../../lib/jsonld';
import { buildMetadata } from '../../../lib/seo';

export const metadata = buildMetadata({
  title: 'Features: All Your Visual Supports in One App',
  description:
    'Visual schedules, a chip board with screen time control, a visual timer, social stories and first-then boards in one app the whole care team shares.',
  path: '/features',
});

export default function Features() {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <Crumbs items={[['Features']]} />
          <p className="eyebrow">What&rsquo;s inside</p>
          <h1>All of your visual supports, one dashboard</h1>
          <p className="lede">
            Replace three or four separate apps or laminated tools with one simple app, shareable with the whole care team.
          </p>
        </div>
      </section>

      <section aria-label="Tools">
        <div className="wrap">
          {TOOLS.map((t, i) => (
            <article key={t.id} id={t.id} className="feature-row">
              <div>
                <span className="icon-chip">
                  <Icon name={t.icon} />
                </span>
                <h2>{t.title}</h2>
                <p>{t.long}</p>
              </div>
              <div className="feature-art">
                <Phone src={t.screen} alt={t.alt} priority={i === 0} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section sand" aria-labelledby="team-title">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">For the whole care team</p>
            <h2 id="team-title">Everyone works from the same plan</h2>
            <p>Chipperly is multi-user from the ground up. Families, teachers and therapists share the same dashboard.</p>
          </div>
          <div className="cards">
            {CARE_TEAM.map((c) => (
              <div key={c.title} className="card">
                <span className="icon-chip">
                  <Icon name={c.icon} />
                </span>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="section" aria-labelledby="faq-title">
        <div className="narrow">
          <div className="section-head">
            <p className="eyebrow">Questions</p>
            <h2 id="faq-title">Frequently asked questions</h2>
          </div>
          <div className="faq">
            {FAQS.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <JsonLd graph={[softwareApp(), faqPage(FAQS), breadcrumbs([['Features', '/features']])]} />
    </>
  );
}
