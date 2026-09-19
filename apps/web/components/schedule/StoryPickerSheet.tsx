'use client';

import { useRouter } from 'next/navigation';
import { useStories } from '@/lib/data/stories';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSheet } from '@/components/ui/Sheet';
import styles from './StoryPickerSheet.module.css';

export interface StoryPickerSheetProps {
  profileId: string;
  /** The item's current story_id, so a "Remove story" action only shows when one is attached. */
  currentStoryId: string | null;
  /** Caller (ItemSheet) writes the pick and returns to itself; this component only picks. */
  onPick: (storyId: string | null) => void;
}

/** Sheet opened from ItemSheet's Story row (S7): attach, switch, or remove the item's social story. */
export function StoryPickerSheet({ profileId, currentStoryId, onPick }: StoryPickerSheetProps) {
  const router = useRouter();
  const { close } = useSheet();
  const stories = useStories(profileId);

  function createNew(): void {
    // No return-path convention exists yet for the new-story route (it's a
    // page, not a sheet), so this just navigates there like every other
    // "Create new" tile in the app (Picker.tsx, StoriesScreen.tsx).
    close();
    router.push('/story/edit/');
  }

  if (stories.length === 0) {
    return (
      <EmptyState
        sentence="No stories yet"
        actions={[
          <Button key="new" onClick={createNew}>
            Create new
          </Button>,
        ]}
      />
    );
  }

  return (
    <div className={styles.picker}>
      <div className={styles.grid}>
        <button type="button" className={styles.createNew} onClick={createNew} aria-label="Create new">
          <Icon name="plus" size={24} />
          <span>Create new</span>
        </button>
        {stories.map((story) => (
          <button
            key={story.id}
            type="button"
            className={styles.tile}
            onClick={() => onPick(story.id)}
            aria-label={story.title}
          >
            <Picture emoji={story.emoji} photo_id={story.cover_photo_id} name={story.title} size="grid" />
            <span className={styles.tileName} title={story.title}>
              {story.title}
            </span>
          </button>
        ))}
      </div>
      {currentStoryId ? (
        <Button variant="ghost" fullWidth onClick={() => onPick(null)}>
          Remove story
        </Button>
      ) : null}
    </div>
  );
}
