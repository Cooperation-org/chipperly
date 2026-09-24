'use client';

import { useMediaUrl } from '@/lib/data/media';
import { PictureTile, type PictureTileSize } from '@/components/ui/PictureTile';
import { PhotoZoom } from '@/components/ui/PhotoZoom';

export interface PictureProps {
  emoji?: string | null;
  photo_id?: string | null;
  name: string;
  size: PictureTileSize;
  /** Tap a photo to see it large; emoji stay as they are. Never inside another button. */
  zoomable?: boolean;
}

/**
 * The one component every screen uses to show an activity/reward/location/
 * story/profile picture: resolves `photo_id` to a URL and renders the tile.
 */
export function Picture({ emoji, photo_id, name, size, zoomable }: PictureProps) {
  const photoUrl = useMediaUrl(photo_id);
  const tile = (
    <PictureTile emoji={emoji ?? undefined} photo_id={photo_id ?? undefined} photoUrl={photoUrl} name={name} size={size} />
  );
  return zoomable && photoUrl ? (
    <PhotoZoom url={photoUrl} name={name}>
      {tile}
    </PhotoZoom>
  ) : (
    tile
  );
}
