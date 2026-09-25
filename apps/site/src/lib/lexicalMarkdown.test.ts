import { describe, expect, it } from 'vitest';
import { lexicalToMarkdown } from './lexicalMarkdown';

const text = (t: string, format = 0) => ({ type: 'text', text: t, format });
const root = (...children: object[]) => ({ root: { type: 'root', children } });

describe('lexicalToMarkdown', () => {
  it('converts headings, paragraphs with formatting, quotes and rules', () => {
    const md = lexicalToMarkdown(
      root(
        { type: 'heading', tag: 'h2', children: [text('Why it helps')] },
        { type: 'paragraph', children: [text('Plain, '), text('bold', 1), text(' and '), text('italic', 2)] },
        { type: 'quote', children: [text('A quote')] },
        { type: 'horizontalrule' },
        { type: 'paragraph', children: [] },
      ),
    );
    expect(md).toBe('## Why it helps\n\nPlain, **bold** and *italic*\n\n> A quote\n\n---');
  });

  it('converts nested and numbered lists', () => {
    const md = lexicalToMarkdown(
      root({
        type: 'list',
        listType: 'number',
        children: [
          { type: 'listitem', children: [text('One')] },
          {
            type: 'listitem',
            children: [text('Two'), { type: 'list', listType: 'bullet', children: [{ type: 'listitem', children: [text('Two a')] }] }],
          },
        ],
      }),
    );
    expect(md).toBe('1. One\n2. Two\n  - Two a');
  });

  it('makes internal links absolute and keeps external ones', () => {
    const abs = (p: string) => `https://chipperlyapp.com${p}`;
    const md = lexicalToMarkdown(
      root({
        type: 'paragraph',
        children: [
          { type: 'link', fields: { linkType: 'internal', doc: { relationTo: 'posts', value: { slug: 'timers' } } }, children: [text('timers')] },
          text(' and '),
          { type: 'link', fields: { linkType: 'custom', url: 'https://example.com' }, children: [text('this')] },
        ],
      }),
      abs,
    );
    expect(md).toBe('[timers](https://chipperlyapp.com/blog/timers) and [this](https://example.com)');
  });

  it('survives empty or malformed input', () => {
    expect(lexicalToMarkdown(null)).toBe('');
    expect(lexicalToMarkdown({})).toBe('');
  });
});
