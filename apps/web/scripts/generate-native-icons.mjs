// One-off (rerun when brand/logo/logo.svg changes, per brand/README.md "regenerate
// from here"): repaints every existing Capacitor-generated icon/splash placeholder
// with the real Chipperly mark, at each file's own existing dimensions, so it hits
// exactly the files Capacitor's templates actually need without hand-listing every
// Android density bucket / iOS asset slot.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.join(import.meta.dirname, '..');
const logoSvg = await sharp(path.join(root, '..', '..', 'brand', 'logo', 'logo.svg')).png().toBuffer();

const CREAM = '#faf8f5';

/**
 * The star on a fully opaque background: legacy Android launcher icons, iOS
 * app icon. No alpha channel at all (not just fully-opaque alpha) -- App
 * Store Connect rejects an AppIcon asset that carries one.
 */
async function iconOpaque(size) {
  const pad = Math.round(size * 0.16);
  const mark = await sharp(logoSvg).resize(size - pad * 2, size - pad * 2, { fit: 'contain' }).toBuffer();
  // sharp doesn't actually drop the alpha channel when .flatten() is chained
  // straight after .composite() in one pipeline; splitting into two passes does.
  const composited = await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toBuffer();
  return sharp(composited).flatten({ background: '#ffffff' }).png().toBuffer();
}

/** The star alone, transparent: Android adaptive icon foreground layer (masked by the OS, extra padding for the safe zone). */
async function iconTransparent(size) {
  const pad = Math.round(size * 0.3);
  const mark = await sharp(logoSvg).resize(size - pad * 2, size - pad * 2, { fit: 'contain' }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toBuffer();
}

/** The star centered on the brand's cream canvas: splash screens. */
async function splash(width, height) {
  const markSize = Math.round(Math.min(width, height) * 0.32);
  const mark = await sharp(logoSvg).resize(markSize, markSize, { fit: 'contain' }).toBuffer();
  return sharp({ create: { width, height, channels: 4, background: CREAM } })
    .composite([{ input: mark, top: Math.round((height - markSize) / 2), left: Math.round((width - markSize) / 2) }])
    .png()
    .toBuffer();
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.png')) out.push(full);
  }
  return out;
}

let count = 0;
for (const platform of ['android', 'ios']) {
  const dir = path.join(root, platform);
  let files;
  try {
    files = await walk(dir);
  } catch {
    continue;
  }
  for (const file of files) {
    const name = path.basename(file);
    const isIcon = /ic_launcher|AppIcon/.test(name);
    const isSplash = /splash/i.test(name);
    if (!isIcon && !isSplash) continue;

    const { width, height } = await sharp(file).metadata();
    if (!width || !height) continue;

    let buffer;
    if (isSplash) {
      buffer = await splash(width, height);
    } else if (/foreground/.test(name)) {
      buffer = await iconTransparent(width);
    } else {
      buffer = await iconOpaque(width);
    }
    await sharp(buffer).toFile(file);
    count++;
  }
}
console.log(`Repainted ${count} native icon/splash files from brand/logo/logo.svg.`);
