import { withBase } from '../api/base';

/** Pages past this are left out: a story is a few pages, and each page is a full picture in memory. */
export const PDF_PAGE_LIMIT = 40;

/** Widest page picture, in pixels: sharp on a tablet, small enough to store and sync. */
const PAGE_WIDTH = 1600;

export function isPdfFile(file: { name: string; type: string }): boolean {
  return file.type === 'application/pdf' || ((file.type === '' || file.type === 'application/octet-stream') && /\.pdf$/i.test(file.name));
}

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
  cleanup(): void;
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(o: { data: Uint8Array }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }> };
}

/**
 * Each page of a PDF as a JPEG, named so pages sort in order ("Story page 001.jpg").
 * pdf.js 4.10.38 (legacy build, for older iPads) is served from public/pdfjs and only loads when a PDF is picked,
 * so it is in no bundle and no offline cache.
 */
export async function pdfToImages(file: File): Promise<File[]> {
  const pdfjs = (await import(/* webpackIgnore: true */ withBase('/pdfjs/pdf.min.mjs'))) as PdfJs;
  pdfjs.GlobalWorkerOptions.workerSrc = withBase('/pdfjs/pdf.worker.min.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const base = file.name.replace(/\.pdf$/i, '').trim() || 'Story';
  const out: File[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, PDF_PAGE_LIMIT); n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: Math.min(3, PAGE_WIDTH / page.getViewport({ scale: 1 }).width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas');
      // PDFs are usually drawn on white paper; a JPEG has no transparency to fall back on.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      page.cleanup();
      if (blob) out.push(new File([blob], `${base} page ${String(n).padStart(3, '0')}.jpg`, { type: 'image/jpeg' }));
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
