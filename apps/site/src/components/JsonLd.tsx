// One <script type="application/ld+json"> holding a @graph of nodes.
// `<` is escaped so text from the CMS can never close the script tag.
export function JsonLd({ graph }: { graph: object[] }) {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
