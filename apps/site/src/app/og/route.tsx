import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { TAGLINE } from '../../lib/site';

// Default 1200x630 share image: the star mark, a title and the tagline.
// Used by any page or post without its own SEO image (lib/seo ogImageUrl).
export async function GET(req: Request) {
  const title = (new URL(req.url).searchParams.get('title') || 'Visual supports made simple for everyone').slice(0, 110);
  const svg = await readFile(path.join(process.cwd(), 'public/brand/mark.svg'));
  const mark = `data:image/svg+xml;base64,${svg.toString('base64')}`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#faf8f5', color: '#22302f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} width={84} height={84} alt="" />
          <span style={{ fontSize: 44, fontWeight: 700 }}>Chipperly</span>
        </div>
        <div style={{ fontSize: title.length > 60 ? 60 : 76, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000, display: 'flex' }}>{title}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 30, color: '#1f6f78' }}>
          <span>{TAGLINE}</span>
          <span style={{ color: '#56615f' }}>chipperlyapp.com</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400, immutable' } },
  );
}
