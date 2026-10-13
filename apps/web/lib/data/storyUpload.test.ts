import { describe, expect, it, vi } from 'vitest';

const { pickAndStoreImage, saveStory, pdfToImages } = vi.hoisted(() => ({
  pickAndStoreImage: vi.fn(),
  saveStory: vi.fn(),
  pdfToImages: vi.fn(),
}));
vi.mock('./media', () => ({ pickAndStoreImage }));
vi.mock('./stories', () => ({ saveStory }));
vi.mock('../media/pdfPages', async (real) => ({ ...(await real<typeof import('../media/pdfPages')>()), pdfToImages }));

import { createFromImages, PdfOpenError, pagesFromMedia, sortUploadFiles, titleFromFileName } from './storyUpload';
import { PhotoDecodeError } from '../media/imageFile';

describe('sortUploadFiles', () => {
  it('orders names naturally and drops non-images', () => {
    const files = [
      { name: 'page10.png', type: 'image/png' },
      { name: 'page2.png', type: 'image/png' },
      { name: 'notes.pdf', type: 'application/pdf' },
    ];
    expect(sortUploadFiles(files).map((f) => f.name)).toEqual(['page2.png', 'page10.png']);
  });

  it('keeps iPhone HEIC files that arrive with no type, by extension', () => {
    const files = [
      { name: 'IMG_2.HEIC', type: '' },
      { name: 'IMG_1.heif', type: 'application/octet-stream' },
      { name: 'readme', type: '' },
    ];
    expect(sortUploadFiles(files).map((f) => f.name)).toEqual(['IMG_1.heif', 'IMG_2.HEIC']);
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
  it('makes no story when no file is a picture or a PDF', async () => {
    expect(await createFromImages('p1', [new File(['x'], 'notes.txt', { type: 'text/plain' })])).toBeNull();
    expect(saveStory).not.toHaveBeenCalled();
  });

  it('turns each PDF page into a story page, in order, alongside picked pictures', async () => {
    pdfToImages.mockResolvedValue(['Dentist page 001.jpg', 'Dentist page 002.jpg'].map((n) => new File(['x'], n, { type: 'image/jpeg' })));
    pickAndStoreImage.mockImplementation((f: File) => Promise.resolve(`m-${f.name}`));
    saveStory.mockClear();
    saveStory.mockResolvedValue('s0');
    const pdf = new File(['%PDF'], 'Dentist.pdf', { type: '' });
    expect(await createFromImages('p1', [pdf])).toEqual({ storyId: 's0', skipped: 0, cantOpen: [], cantOpenPdf: [] });
    const saved = saveStory.mock.calls[0]?.[0];
    expect(saved.title).toBe('Dentist');
    expect(saved.pages.map((p: { photo_id: string }) => p.photo_id)).toEqual(['m-Dentist page 001.jpg', 'm-Dentist page 002.jpg']);
  });

  it('names a PDF that cannot be opened, and throws when it was the only file', async () => {
    pdfToImages.mockRejectedValue(new Error('password'));
    saveStory.mockClear();
    const pdf = new File(['%PDF'], 'locked.pdf', { type: 'application/pdf' });
    await expect(createFromImages('p1', [pdf])).rejects.toBeInstanceOf(PdfOpenError);
    expect(saveStory).not.toHaveBeenCalled();
    pickAndStoreImage.mockImplementation((f: File) => Promise.resolve(`m-${f.name}`));
    saveStory.mockResolvedValue('s9');
    const made = await createFromImages('p1', [pdf, new File(['x'], 'cover.png', { type: 'image/png' })]);
    expect(made?.cantOpenPdf).toEqual(['locked.pdf']);
  });

  it('leaves out a picture that cannot be read and keeps the rest', async () => {
    pickAndStoreImage.mockImplementation((f: File) =>
      f.name === 'bad.png' ? Promise.reject(new Error('decode')) : Promise.resolve(`m-${f.name}`),
    );
    saveStory.mockResolvedValue('s1');
    const files = ['p1.png', 'bad.png', 'p2.png'].map((n) => new File(['x'], n, { type: 'image/png' }));
    expect(await createFromImages('p1', files)).toEqual({ storyId: 's1', skipped: 1, cantOpen: [], cantOpenPdf: [] });
    expect(saveStory.mock.calls[0]?.[0].pages.map((p: { photo_id: string }) => p.photo_id)).toEqual(['m-p1.png', 'm-p2.png']);
  });

  it('names a HEIC the browser cannot decode and keeps the other pictures', async () => {
    pickAndStoreImage.mockImplementation((f: File) =>
      f.name === 'IMG_2.HEIC' ? Promise.reject(new PhotoDecodeError()) : Promise.resolve(`m-${f.name}`),
    );
    saveStory.mockClear();
    saveStory.mockResolvedValue('s2');
    const files = [new File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' }), new File(['x'], 'IMG_2.HEIC', { type: '' })];
    expect(await createFromImages('p1', files)).toEqual({ storyId: 's2', skipped: 1, cantOpen: ['IMG_2.HEIC'], cantOpenPdf: [] });
    expect(saveStory.mock.calls[0]?.[0].pages.map((p: { photo_id: string }) => p.photo_id)).toEqual(['m-IMG_1.jpg']);
  });

  it('throws the decode error when every picture is an undecodable HEIC', async () => {
    pickAndStoreImage.mockRejectedValue(new PhotoDecodeError());
    saveStory.mockClear();
    await expect(createFromImages('p1', [new File(['x'], 'IMG_1.HEIC', { type: '' })])).rejects.toBeInstanceOf(PhotoDecodeError);
    expect(saveStory).not.toHaveBeenCalled();
  });

  it('throws when no picture can be read', async () => {
    pickAndStoreImage.mockRejectedValue(new Error('decode'));
    saveStory.mockClear();
    await expect(createFromImages('p1', [new File(['x'], 'a.png', { type: 'image/png' })])).rejects.toThrow();
    expect(saveStory).not.toHaveBeenCalled();
  });
});
