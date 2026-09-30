/** The bits of a DataTransferItem we read, so tests don't need a DOM. */
export interface ClipboardItemLike {
  kind: string;
  type: string;
  getAsFile: () => File | null;
}

/** First image file in a paste event's clipboardData.items, or null. */
export function firstImageFile(items: ArrayLike<ClipboardItemLike> | null | undefined): File | null {
  for (const item of Array.from(items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** True when a paste should go to a text field instead of the picker. */
export function isTextEntryTarget(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}
