import Link from 'next/link';

// Visible breadcrumb trail; the matching BreadcrumbList JSON-LD is added
// by each page through lib/jsonld breadcrumbs().
export function Crumbs({ items }: { items: [name: string, path?: string][] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="crumbs">
        <li>
          <Link href="/">Home</Link>
        </li>
        {items.map(([name, path]) => (
          <li key={name}>{path ? <Link href={path}>{name}</Link> : <span aria-current="page">{name}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}
