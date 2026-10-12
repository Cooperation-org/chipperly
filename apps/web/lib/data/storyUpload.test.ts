import { describe, expect, it } from 'vitest';
import { pagesFromMedia, sortUploadFiles, titleFromFileName } from './storyUpload';

describe('sortUploadFiles', () => {
  it('orders names naturally and drops non-images', () => {
    const files = [
      { name: 'page10.png', type: 'image/png' },
      { name: 'page2.png', type: 'image/png' },
      { name: 'notes.pdf', type: 'application/pdf' },
    ];
    expect(sortUploadFiles(files).map((f) => f.name)).toEqual(['page2.png', 'page10.png']);
  });
});

describe('titleFromFileName', () => {
  it('drops the extension and page number', () => {
    expect(titleFromFileName('Going to the dentist_page1.jpg')).toBe('Going to the dentist');
    expect(titleFromFileName('1.png')).toBe('Uploaded story');
  });
});

describe('pagesFromMedia', () => {
  it('makes one picture page per id, in order', () => {
    expect(pagesFromMedia(['a', 'b'])).toEqual([
      { text: '', emoji: null, photo_id: 'a' },
      { text: '', emoji: null, photo_id: 'b' },
    ]);
  });
});
