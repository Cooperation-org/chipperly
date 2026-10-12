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
  type Node = { text?: unknown; children?: Node[] };
  const walk = (n: Node) => {
    if (typeof n.text === 'string') n.text = text(n.text);
    n.children?.forEach(walk);
  };
  const lexical = (data: SerializedEditorState): SerializedEditorState => {
    const copy = structuredClone(data);
    walk(copy.root as Node);
    return copy;
  };
  return { text, lexical };
}
