import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical';
import type { SerializedLinkNode } from '@payloadcms/richtext-lexical';
import type { JSXConvertersFunction } from '@payloadcms/richtext-lexical/react';
import { LinkJSXConverter, RichText as Lexical } from '@payloadcms/richtext-lexical/react';

const internalDocToHref = ({ linkNode }: { linkNode: SerializedLinkNode }) => {
  const doc = linkNode.fields.doc;
  if (!doc || typeof doc.value !== 'object') return '/';
  const slug = (doc.value as { slug?: string }).slug ?? '';
  return doc.relationTo === 'posts' ? `/blog/${slug}` : `/${slug}`;
};

const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  ...LinkJSXConverter({ internalDocToHref }),
});

export function RichText({ data }: { data: SerializedEditorState }) {
  return <Lexical data={data} converters={converters} className="prose" />;
}
