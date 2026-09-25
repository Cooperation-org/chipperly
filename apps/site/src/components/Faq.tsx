// FAQ accordion (native <details>, works without JS). The matching FAQPage
// JSON-LD is added by the page from the same list via lib/jsonld faqPage().
export type FaqItem = { question: string; answer: string };

export function Faq({ items, title = 'Frequently asked questions', id = 'faq' }: { items: FaqItem[]; title?: string; id?: string }) {
  if (!items.length) return null;
  return (
    <section id={id} className="faq-block" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div className="faq">
        {items.map((f) => (
          <details key={f.question}>
            <summary>{f.question}</summary>
            {f.answer.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </details>
        ))}
      </div>
    </section>
  );
}
