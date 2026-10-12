import { Crumbs } from '../../../components/Crumbs';
import { JsonLd } from '../../../components/JsonLd';
import { breadcrumbs } from '../../../lib/jsonld';
import { BETA_NOTE, ORG_FAMILY_NOTE, ORG_TIERS, PLANS, tierPrice, usd } from '../../../lib/pricing';
import { buildMetadata } from '../../../lib/seo';
import { BRAND, CONTACT_EMAIL } from '../../../lib/site';

export const metadata = buildMetadata({
  title: 'Pricing',
  description: 'Chipperly plans for individuals and households, and annual licences for schools, clinics and other organizations.',
  path: '/pricing',
});

export default function Pricing() {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <Crumbs items={[['Pricing']]} />
          <p className="eyebrow">Pricing</p>
          <h1>Simple plans for {BRAND}</h1>
          <p className="lede">Pay monthly or save with a yearly plan. Every {BRAND} plan has all five tools.</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="plans-title">
        <div className="wrap">
          <h2 id="plans-title" className="sr-only">
            Individual and household plans
          </h2>
          <div className="cards">
            {PLANS.map((p) => (
              <div key={p.name} className="card">
                <h3>{p.name}</h3>
                <p>
                  <strong>{usd(p.month)}/month</strong> or <strong>{usd(p.year)}/year</strong>
                </p>
                <p>{p.text}</p>
              </div>
            ))}
          </div>
          <p className="lede" style={{ marginTop: 24 }}>
            {BETA_NOTE}
          </p>
        </div>
      </section>

      <section className="section sand" aria-labelledby="org-title">
        <div className="narrow">
          <div className="section-head">
            <p className="eyebrow">Organizations</p>
            <h2 id="org-title">Schools, clinics and care providers</h2>
            <p>One annual licence, priced by the number of Primary Users.</p>
          </div>
          <div className="prose">
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {ORG_TIERS.map((t) => (
                  <tr key={t.label}>
                    <td>
                      {t.label}
                      {'note' in t ? <> ({t.note})</> : null}
                    </td>
                    <td>{tierPrice(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>{ORG_FAMILY_NOTE}</p>
            <p>
              Questions? Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </div>
        </div>
      </section>

      <JsonLd graph={[breadcrumbs([['Pricing', '/pricing']])]} />
    </>
  );
}
