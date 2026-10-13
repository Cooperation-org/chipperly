import { describe, expect, it } from 'vitest';
import { isPdfFile } from './pdfPages';

describe('isPdfFile', () => {
  it('knows a PDF by type, or by name when the browser gave no type', () => {
    expect(isPdfFile({ name: 'story.pdf', type: 'application/pdf' })).toBe(true);
    expect(isPdfFile({ name: 'Story.PDF', type: '' })).toBe(true);
    expect(isPdfFile({ name: 'story.pdf', type: 'application/octet-stream' })).toBe(true);
    expect(isPdfFile({ name: 'story.pdf.png', type: 'image/png' })).toBe(false);
    expect(isPdfFile({ name: 'fake.pdf', type: 'image/png' })).toBe(false);
  });
});
