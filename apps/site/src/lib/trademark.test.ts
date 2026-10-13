import { describe, expect, it } from 'vitest';
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical';
import { firstMention, tmHeading } from './trademark';

const doc = (...texts: string[]) =>
  ({ root: { type: 'root', children: texts.map((t) => ({ type: 'paragraph', children: [{ type: 'text', text: t }] })) } }) as unknown as SerializedEditorState;
const texts = (d: SerializedEditorState) => (d.root.children as unknown as { children: { text: string }[] }[]).map((p) => p.children[0].text);

describe('firstMention', () => {
  it('marks only the first mention in the body and does not mutate the input', () => {
    const input = doc('Hello', 'Chipperly helps. Chipperly again.', 'Chipperly');
    expect(texts(firstMention().lexical(input))).toEqual(['Hello', 'Chipperly™ helps. Chipperly again.', 'Chipperly']);
    expect(texts(input)[1]).toBe('Chipperly helps. Chipperly again.');
  });

  it('counts the lede as the first mention', () => {
    const tm = firstMention();
    expect(tm.text('Why Chipperly works')).toBe('Why Chipperly™ works');
    expect(texts(tm.lexical(doc('Chipperly is simple')))).toEqual(['Chipperly is simple']);
  });

  it('marks the first mention in a plain description, such as a blog category', () => {
    expect(firstMention().text('Tips from Chipperly families. Chipperly helps.')).toBe('Tips from Chipperly™ families. Chipperly helps.');
    expect(firstMention().text('Routines that stick')).toBe('Routines that stick');
  });

  it('keeps a mark an editor already typed', () => {
    expect(texts(firstMention().lexical(doc('Chipperly™ first, Chipperly second')))).toEqual(['Chipperly™ first, Chipperly second']);
  });

  it('marks every Chipperly in a heading, and a heading does not use up the first mention', () => {
    const input = {
      root: {
        type: 'root',
        children: [
          { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Why Chipperly' }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'Chipperly helps.' }] },
          { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Chipperly at home' }] },
        ],
      },
    } as unknown as SerializedEditorState;
    expect(texts(firstMention().lexical(input))).toEqual(['Why Chipperly™', 'Chipperly™ helps.', 'Chipperly™ at home']);
  });
});

describe('tmHeading', () => {
  it('marks every mention once', () => {
    expect(tmHeading('Chipperly and Chipperly™ at home')).toBe('Chipperly™ and Chipperly™ at home');
  });
});
