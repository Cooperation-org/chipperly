// Renders public/og/og-image.png (1200x630) from the brand PNGs.
// Re-run: node apps/web/scripts/generate-og-image.mjs
// Background is the brand cream #FAF8F5; wordmark and tagline are the owner's black artwork
// (both far above 4.5:1 on cream). The logo teal #13B6A5 is never used for text.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = (f) => path.join(root, 'public/brand', f);
const W = 1200;
const H = 630;

// logo.png: transparent lockup on a wide canvas. Trim, flatten on white so multiply keeps colours.
const lockup = await sharp(brand('logo.png'))
  .flatten({ background: '#ffffff' })
  .trim({ background: '#ffffff', threshold: 10 })
  .resize({ width: 900 })
  .toBuffer();

// logo-tagline.png: tagline sits in the bottom strip of a 1000x1000 canvas.
const strip = await sharp(brand('logo-tagline.png'))
  .extract({ left: 0, top: 780, width: 1000, height: 140 })
  .toBuffer();
const tagline = await sharp(strip)
  .trim({ background: '#ffffff', threshold: 10 })
  .resize({ width: 640 })
  .toBuffer();

const lm = await sharp(lockup).metadata();
const tm = await sharp(tagline).metadata();
const gap = 8;
const top = Math.round((H - (lm.height + gap + tm.height)) / 2);

const png = await sharp({ create: { width: W, height: H, channels: 3, background: '#FAF8F5' } })
  .composite([
    { input: lockup, left: Math.round((W - lm.width) / 2), top, blend: 'multiply' },
    { input: tagline, left: Math.round((W - tm.width) / 2), top: top + lm.height + gap, blend: 'multiply' },
  ])
  .png({ palette: true, quality: 90, compressionLevel: 9 })
  .toBuffer();

await sharp(png).toFile(path.join(root, 'public/og/og-image.png'));
const out = await sharp(png).metadata();
console.log(`og-image.png ${out.width}x${out.height}, ${png.length} bytes`);
