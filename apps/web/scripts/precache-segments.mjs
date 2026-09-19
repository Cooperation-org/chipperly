// Adds the App Router's per-route RSC files (`<route>/index.txt`,
// `__next._tree.txt`, `__next.<segment>.__PAGE__.txt`, ...) to the service
// worker's precache manifest. `next build` writes them during the export,
// after Serwist has already bundled sw.js, so they can't be listed in
// next.config.ts's additionalPrecacheEntries. Without them, a tab switch
// while offline fails its RSC fetch and Next falls back to a full
// navigation, which is slower and not reliable on every browser.
// Runs after fix-segment-export.mjs so the flattened names are the ones listed.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? 'out');

async function walk(dir, acc) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '_next') await walk(p, acc);
    } else if (e.name.endsWith('.txt') && e.name !== 'robots.txt') {
      acc.push(p);
    }
  }
  return acc;
}

const swPath = path.join(out, 'sw.js');
const sw = await fs.readFile(swPath, 'utf8');
const marker = '],precacheOptions:';

// The base path comes from the manifest Serwist already wrote, not from the
// environment: NEXT_PUBLIC_BASE_PATH lives in .env.production, which `next`
// loads and a plain node script does not, so reading it here would silently
// drop the prefix on a subdirectory deploy and 404 every entry (which fails
// the whole precache install). An asset url always carries it.
const prefixMatch = sw.match(/'url':'([^']*)\/_next\/static\//);
if (!sw.includes(marker) || !prefixMatch) {
  console.error(`precache-segments: sw.js is not the shape we patch (marker ${sw.includes(marker) ? 'found' : 'missing'}, prefix ${prefixMatch ? 'found' : 'missing'})`);
  process.exit(1);
}
const prefix = prefixMatch[1];

const files = await walk(out, []);
const entries = await Promise.all(
  files.map(async (file) => {
    const revision = createHash('md5').update(await fs.readFile(file)).digest('hex').slice(0, 16);
    const url = `${prefix}/${path.relative(out, file).split(path.sep).join('/')}`;
    return `{'revision':'${revision}','url':'${url}'}`;
  }),
);
if (entries.length === 0) {
  console.error('precache-segments: no .txt files found in the export');
  process.exit(1);
}
await fs.writeFile(swPath, sw.replace(marker, `,${entries.join(',')}${marker}`));
console.log(`precache-segments: added ${entries.length} RSC files under '${prefix || '/'}' to ${path.relative(process.cwd(), swPath)}`);
