'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DayItem, DayStep, StepNode } from '@/lib/data/schedule';
import { removeFromDay, setCompleted, setItemStory, setStepCompleted, stepTree } from '@/lib/data/schedule';
import { db } from '@/lib/db/db';
import { upsert, restore } from '@/lib/sync/mutate';
import { setDuration, start } from '@/lib/timer/store';
import { Picture } from '@/components/media/Picture';
import { StepRow } from '@/components/ui/StepRow';
import { Segmented } from '@/components/ui/Segmented';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSheet } from '@/components/ui/Sheet';
import { toast } from '@/lib/toast';
import { formatTime } from './todayModel';
import { StoryPickerSheet } from './StoryPickerSheet';
import { VisualSchedule } from './VisualSchedule';
import styles from './ItemSheet.module.css';

/** Finds a node anywhere in a tree by its step id (depth-first). */
function findNode(nodes: readonly StepNode[], stepId: string): StepNode | undefined {
  for (const node of nodes) {
    if (node.node.step.id === stepId) return node;
    const found = findNode(node.children, stepId);
    if (found) return found;
  }
  return undefined;
}

export interface ItemSheetProps {
  day: DayItem;
  userId: string;
}

const PART_OF_DAY_ITEMS = [
  { value: 'none', label: 'None' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

/** S7: the item sheet opened by tapping a Today row. */
export function ItemSheet({ day, userId }: ItemSheetProps) {
  const router = useRouter();
  const { close, open, back } = useSheet();
  const [removing, setRemoving] = useState(false);
  const item = day.item;
  // Same snapshot problem as liveCompletions below: the story is attached from
  // inside this sheet, so which one is attached has to come from the live row.
  const storyId = useLiveQuery(
    async () => (await db.schedule_items.get(item.id))?.story_id ?? null,
    [item.id],
    item.story_id ?? null,
  );
  const story = useLiveQuery(() => (storyId ? db.social_stories.get(storyId) : undefined), [storyId]);

  // `day` is a snapshot from whenever this sheet was opened (Sheet content
  // isn't re-rendered by its caller), so step completion state is re-derived
  // live here: `day.steps[].step` (structure) rarely changes mid-sheet, but
  // completions do, especially with cascading checks in and out of the
  // visual schedule overlay below.
  const liveCompletions = useLiveQuery(
    () => db.step_completions.where('schedule_item_id').equals(item.id).toArray(),
    [item.id],
    [],
  );
  const liveSteps = useMemo<DayStep[]>(() => {
    const byStep = new Map(liveCompletions.filter((c) => c.deleted_at === null).map((c) => [c.activity_step_id, c]));
    return day.steps.map((s) => {
      const completion = byStep.get(s.step.id);
      return { ...s, completed_at: completion?.completed_at ?? null, completed_by: completion?.completed_by ?? null, completion_id: completion?.id ?? null };
    });
  }, [day.steps, liveCompletions]);
  const tree = useMemo(() => stepTree(liveSteps), [liveSteps]);

  const [expandedStepIds, setExpandedStepIds] = useState<ReadonlySet<string>>(new Set());
  function toggleStepExpanded(stepId: string): void {
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  // null = closed; 'item' = the whole routine; a step id = that step's sub-tree.
  const [scheduleView, setScheduleView] = useState<null | 'item' | string>(null);

  function renderStepNode(node: StepNode, depth: number): ReactNode {
    const step = node.node.step;
    const hasChildren = node.children.length > 0;
    const expanded = expandedStepIds.has(step.id);
    return (
      <li key={step.id}>
        <StepRow
          tile={<Picture emoji={step.emoji} photo_id={step.photo_id} name={step.name} size="list" />}
          name={step.name}
          checked={node.done}
          onChange={(next) => void setStepCompleted(item.id, step.id, next, userId)}
          durationMinutes={step.duration_minutes}
          onStartTimer={step.duration_minutes ? () => startStepTimer(step.duration_minutes as number) : undefined}
          depth={depth}
          hasChildren={hasChildren}
          expanded={expanded}
          onToggle={hasChildren ? () => toggleStepExpanded(step.id) : undefined}
          onOpenVisualSchedule={hasChildren ? () => setScheduleView(step.id) : undefined}
        />
        {hasChildren && expanded ? <ul className={styles.steps}>{node.children.map((child) => renderStepNode(child, depth + 1))}</ul> : null}
      </li>
    );
  }

  async function setTime(value: string | null): Promise<void> {
    await upsert('schedule_items', { ...item, start_time: value });
  }

  async function setPartOfDay(value: string): Promise<void> {
    const next = value === 'none' ? null : (value as 'morning' | 'afternoon' | 'evening');
    await upsert('schedule_items', { ...item, part_of_day: next });
  }

  function openStoryPicker(): void {
    open(
      <StoryPickerSheet
        profileId={item.profile_id}
        currentStoryId={storyId}
        onPick={(nextStoryId) => {
          void setItemStory(item.id, nextStoryId);
          back();
        }}
      />,
      { title: 'Story' },
    );
  }

  async function onDone(): Promise<void> {
    await setCompleted(item.id, true, userId);
    close();
    toast(`Done: ${day.activity.name}`, {
      undo: () => {
        void setCompleted(item.id, false, userId);
      },
    });
  }

  function startStepTimer(minutes: number): void {
    setDuration(minutes * 60_000);
    start();
    close();
    router.push('/timer/');
  }

  async function onRemove(scope: 'today' | 'always'): Promise<void> {
    await removeFromDay(item.id, scope);
    close();
    toast(`Removed ${day.activity.name}`, {
      undo: () => {
        void restore('schedule_items', item.id);
      },
    });
  }

  const scheduleNode = scheduleView && scheduleView !== 'item' ? findNode(tree, scheduleView) : undefined;

  return (
    <>
      <div className={styles.sheet}>
        <div className={styles.header}>
          <Picture emoji={day.activity.emoji} photo_id={day.activity.photo_id} name={day.activity.name} size="grid" />
          <h3 className={styles.name}>{day.activity.name}</h3>
        </div>

        <TimeRow value={item.start_time} onChange={setTime} />

        <Segmented label="Part of day" items={PART_OF_DAY_ITEMS} value={item.part_of_day ?? 'none'} onChange={(v) => void setPartOfDay(v)} />

        {tree.length > 0 ? (
          <>
            <p className={styles.routineCaption}>Routine</p>
            <ul className={styles.steps}>{tree.map((node) => renderStepNode(node, 0))}</ul>
            <Button variant="secondary" icon="expand" onClick={() => setScheduleView('item')}>
              Open as visual schedule
            </Button>
          </>
        ) : null}

        {day.activity.chip_value > 0 ? (
          <p className={styles.chips}>
            Earns {day.activity.chip_value} chip{day.activity.chip_value === 1 ? '' : 's'}
          </p>
        ) : null}

        <button type="button" className={styles.storyRow} onClick={openStoryPicker} aria-label={story ? `Story: ${story.title}` : 'Attach a story'}>
          {story ? (
            <Picture emoji={story.emoji} photo_id={story.cover_photo_id} name={story.title} size="list" />
          ) : (
            <Icon name="book" size={24} />
          )}
          <span className={styles.storyRowText}>
            <span className={styles.storyRowLabel}>Story</span>
            <span className={styles.storyRowValue}>{story ? story.title : 'Attach a story'}</span>
          </span>
        </button>

        <div className={styles.actions}>
          <BigButton variant="primary" fullWidth onClick={() => void onDone()}>
            Done
          </BigButton>
          {removing ? (
            <div className={styles.removeChoice}>
              <Button variant="secondary" fullWidth onClick={() => void onRemove('today')}>
                Just today
              </Button>
              <Button variant="secondary" fullWidth onClick={() => void onRemove('always')}>
                Every day
              </Button>
            </div>
          ) : (
            <Button variant="ghost" fullWidth onClick={() => (item.source === 'recurring' ? setRemoving(true) : void onRemove('today'))}>
              Remove from today
            </Button>
          )}
        </div>

        <button
          type="button"
          className={styles.editLink}
          onClick={() => {
            close();
            router.push(`/activity/edit/?id=${day.activity.id}`);
          }}
        >
          Edit activity
        </button>
      </div>

      {scheduleView ? (
        <VisualSchedule
          title={scheduleView === 'item' ? day.activity.name : (scheduleNode?.node.step.name ?? '')}
          picture={
            scheduleView === 'item'
              ? { emoji: day.activity.emoji, photo_id: day.activity.photo_id }
              : { emoji: scheduleNode?.node.step.emoji, photo_id: scheduleNode?.node.step.photo_id }
          }
          nodes={scheduleView === 'item' ? tree : (scheduleNode?.children ?? [])}
          onToggle={(stepId, next) => void setStepCompleted(item.id, stepId, next, userId)}
          onClose={() => setScheduleView(null)}
        />
      ) : null}
    </>
  );
}

function TimeRow({ value, onChange }: { value: string | null; onChange: (next: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker(): void {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.focus();
  }

  return (
    <div className={styles.timeRow}>
      <button type="button" className={styles.timeButton} onClick={openPicker}>
        <Icon name="clock" size={20} />
        {value ? formatTime(value) : 'Add time'}
      </button>
      <input
        ref={inputRef}
        type="time"
        className={styles.hiddenInput}
        value={value ?? ''}
        tabIndex={-1}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {value ? (
        <Button variant="ghost" onClick={() => onChange(null)}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
