'use client';

import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';

export interface EventPictureProps {
  emoji: string | null;
  photoId: string | null;
  title: string;
  size: 'list' | 'grid' | 'child';
}

/** An event's picture: its photo or emoji, or a plain calendar-free star when it has neither. */
export function EventPicture({ emoji, photoId, title, size }: EventPictureProps) {
  if (!emoji && !photoId) return <Icon name="star" size={size === 'list' ? 32 : 48} />;
  return <Picture emoji={emoji} photo_id={photoId} name={title} size={size} />;
}
