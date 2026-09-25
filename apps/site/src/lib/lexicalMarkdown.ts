// Lexical JSON (Payload rich text) to Markdown, for llms-full.txt. Covers
// the nodes our editor makes; anything unknown falls back to its text.
type Node = {
  type?: string;
  tag?: string;
  text?: string;
  format?: number | string;
  listType?: string;
  checked?: boolean;
  children?: Node[];
  fields?: { url?: string; linkType?: string; doc?: { relationTo?: string; value?: { slug?: string } | number } };
  value?: { url?: string; alt?: string } | number;
};

const BOLD = 1;
const ITALIC = 2;
const CODE = 16;

function inline(nodes: Node[] = [], abs: (path: string) => string): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') {
        let t = n.text ?? '';
        const f = typeof n.format === 'number' ? n.format : 0;
        if (f & CODE) t = `\`${t}\``;
        if (f & ITALIC) t = `*${t}*`;
        if (f & BOLD) t = `**${t}**`;
        return t;
      }
      if (n.type === 'linebreak') return '  \n';
      if (n.type === 'link' || n.type === 'autolink') {
        const doc = n.fields?.doc;
        const href =
          n.fields?.linkType === 'internal' && doc && typeof doc.value === 'object'
            ? abs(`${doc.relationTo === 'posts' ? '/blog' : ''}/${doc.value.slug ?? ''}`)
            : (n.fields?.url ?? '');
        return `[${inline(n.children, abs)}](${href})`;
      }
      return inline(n.children, abs);
    })
    .join('');
}

function list(n: Node, abs: (path: string) => string, depth: number): string {
  return (n.children ?? [])
    .map((li, i) => {
      const nested = (li.children ?? []).filter((c) => c.type === 'list');
      const own = (li.children ?? []).filter((c) => c.type !== 'list');
      const marker = n.listType === 'number' ? `${i + 1}.` : n.listType === 'check' ? `- [${li.checked ? 'x' : ' '}]` : '-';
      const line = `${'  '.repeat(depth)}${marker} ${inline(own, abs)}`;
      return [line, ...nested.map((l) => list(l, abs, depth + 1))].join('\n');
    })
    .join('\n');
}

function block(n: Node, abs: (path: string) => string): string {
  switch (n.type) {
    case 'heading':
      return `${'#'.repeat(Math.min(6, Number(n.tag?.slice(1)) || 2))} ${inline(n.children, abs)}`;
    case 'list':
      return list(n, abs, 0);
    case 'quote':
      return `> ${inline(n.children, abs)}`;
    case 'horizontalrule':
      return '---';
    case 'upload':
      return typeof n.value === 'object' && n.value?.url ? `![${n.value.alt ?? ''}](${abs(n.value.url)})` : '';
    default:
      return inline(n.children, abs);
  }
}

export function lexicalToMarkdown(data: unknown, abs: (path: string) => string = (p) => p): string {
  const root = (data as { root?: Node } | null)?.root;
  return (root?.children ?? [])
    .map((n) => block(n, abs))
    .filter((s) => s.trim())
    .join('\n\n');
}
