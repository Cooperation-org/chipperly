import { describe, expect, it, vi } from 'vitest';

const { pickAndStoreImage, saveStory } = vi.hoisted(() => ({
  pickAndStoreImage: vi.fn(),
  saveStory: vi.fn(),
}));
vi.mock('./media', () => ({ pickAndStoreImage }));
vi.mock('./stories', () => ({ saveStory }));

import { createFromImages, pagesFromMedia, sortUploadFiles, titleFromFileName } from './storyUpload';

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
    expect(titleFromFileName('page3.png')).toBe('Uploaded story');
  });

  it('keeps a word that ends in p', () => {
    expect(titleFromFileName('Trip 1.png')).toBe('Trip');
    expect(titleFromFileName('Shop2.jpg')).toBe('Shop2');
    expect(titleFromFileName('Sleep1.png')).toBe('Sleep1');
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

describe('createFromImages', () => {
  it('makes no story when no file is a picture', async () => {
    const pdf = new File(['%PDF'], 'story.pdf', { type: 'application/pdf' });
    expect(await createFromImages('p1', [pdf])).toBeNull();
    expect(saveStory).not.toHaveBeenCalled();
  });
});
