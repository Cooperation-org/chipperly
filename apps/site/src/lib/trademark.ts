import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical';

// Adds the ™ to the first "Chipperly" in a page's body text and leaves the
// rest plain, so nobody has to edit CMS copy by hand. Call text() and
// lexical() in reading order (lede first, then body) on one instance per page.
// If an editor already typed Chipperly™ first, nothing changes.
export function firstMention() {
  let done = false;
  const text = (s: string) => {
    if (done) return s;
    const m = /Chipperly(™)?/.exec(s);
    if (!m) return s;
    done = true;
    const end = m.index + 'Chipperly'.length;
    return m[1] ? s : `${s.slice(0, end)}™${s.slice(end)}`;
  };
  type Node = { type?: string; text?: unknown; children?: Node[] };
  // A heading is marked on its own, so it does not use up the body's first mention.
  const walk = (n: Node, mark: (s: string) => string = text) => {
    if (typeof n.text === 'string') n.text = mark(n.text);
    n.children?.forEach((c) => walk(c, n.type === 'heading' ? tmHeading : mark));
  };
  const lexical = (data: SerializedEditorState): SerializedEditorState => {
    const copy = structuredClone(data);
    walk(copy.root as Node);
    return copy;
  };
  return { text, lexical };
}

/** Headings and page titles carry the ™ on every "Chipperly", not just the first. */
export const tmHeading = (s: string) => s.replace(/Chipperly(?!™)/g, 'Chipperly™');
