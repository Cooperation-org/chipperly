'use client';

import { useMediaUrl } from '@/lib/data/media';
import { PictureTile, type PictureTileSize } from '@/components/ui/PictureTile';

export interface PictureProps {
  emoji?: string | null;
  photo_id?: string | null;
  name: string;
  size: PictureTileSize;
}

/**
 * The one component every screen uses to show an activity/reward/location/
 * story/profile picture: resolves `photo_id` to a URL and renders the tile.
 */
export function Picture({ emoji, photo_id, name, size }: PictureProps) {
  const photoUrl = useMediaUrl(photo_id);
  return (
    <PictureTile emoji={emoji ?? undefined} photo_id={photo_id ?? undefined} photoUrl={photoUrl} name={name} size={size} />
  );
}
