import { describe, expect, it } from 'vitest';
import { firstImageFile, isTextEntryTarget, type ClipboardItemLike } from './clipboardImage';

const png = new File(['x'], 'a.png', { type: 'image/png' });
const item = (kind: string, type: string, file: File | null = null): ClipboardItemLike => ({
  kind,
  type,
  getAsFile: () => file,
});

describe('firstImageFile', () => {
  it('skips text items and returns the first image file', () => {
    expect(firstImageFile([item('string', 'text/plain'), item('file', 'image/png', png)])).toBe(png);
  });
  it('ignores non-image files and image items with no file', () => {
    expect(firstImageFile([item('file', 'application/pdf', png), item('file', 'image/png', null)])).toBeNull();
  });
  it('handles empty input', () => {
    expect(firstImageFile(null)).toBeNull();
    expect(firstImageFile([])).toBeNull();
  });
});

describe('isTextEntryTarget', () => {
  it('is true for inputs, textareas and contenteditable', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
  it('is false for buttons, body and null', () => {
    expect(isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
