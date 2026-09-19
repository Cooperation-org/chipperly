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
const prefix = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

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

const files = await walk(out, []);
const entries = await Promise.all(
  files.map(async (file) => {
    const revision = createHash('md5').update(await fs.readFile(file)).digest('hex').slice(0, 16);
    const url = `${prefix}/${path.relative(out, file).split(path.sep).join('/')}`;
    return `{'revision':'${revision}','url':'${url}'}`;
  }),
);

const swPath = path.join(out, 'sw.js');
const sw = await fs.readFile(swPath, 'utf8');
const marker = '],precacheOptions:';
if (!sw.includes(marker) || entries.length === 0) {
  console.error(`precache-segments: nothing injected (marker ${sw.includes(marker) ? 'found' : 'missing'}, ${entries.length} files)`);
  process.exit(1);
}
await fs.writeFile(swPath, sw.replace(marker, `,${entries.join(',')}${marker}`));
console.log(`precache-segments: added ${entries.length} RSC files to ${path.relative(process.cwd(), swPath)}`);
