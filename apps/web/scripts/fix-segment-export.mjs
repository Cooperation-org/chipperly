// Next 16's static export names RSC segment prefetch files by replacing "/" with "."
// (`__next.<segment>.<route>.__PAGE__.txt`), but on Windows the source paths carry
// backslashes, which the replace misses, so the export writes nested folders instead
// (`__next.<segment>/<route>/__PAGE__.txt`) and the client 404s on every prefetch.
// This flattens them to the names the client requests. No-op on Linux/macOS builds.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? 'out');

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('__next.')) await flatten(dir, p, e.name);
      else await walk(p);
    }
  }
}

async function flatten(parent, segDir, prefix) {
  const files = [];
  async function collect(d, rel) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const r = rel ? `${rel}.${e.name}` : e.name;
      if (e.isDirectory()) await collect(path.join(d, e.name), r);
      else files.push([path.join(d, e.name), r]);
    }
  }
  await collect(segDir, '');
  for (const [src, rel] of files) {
    await fs.rename(src, path.join(parent, `${prefix}.${rel}`));
  }
  await fs.rm(segDir, { recursive: true, force: true });
  return files.length;
}

await walk(out);
