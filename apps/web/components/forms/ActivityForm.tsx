'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Activity, ActivityStep, Recurrence } from '@chipperly/shared/schemas/activity';
import { CHIP_MAX } from '@chipperly/shared/constants/limits';
import { db } from '@/lib/db/db';
import { deleteActivity, saveActivity, useActivities, useActivity, type SaveActivityStepInput } from '@/lib/data/activities';
import { addToDay, stepTree, type DayStep, type StepNode } from '@/lib/data/schedule';
import { useLocations } from '@/lib/data/locations';
import { useActiveProfile } from '@/lib/profile/active';
import { restore } from '@/lib/sync/mutate';
import { newId } from '@/lib/ids';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { Picture } from '@/components/media/Picture';
import { Picker } from '@/components/picker/Picker';
import { VisualSchedule } from '@/components/schedule/VisualSchedule';
import { TextField } from '@/components/ui/TextField';
import { Stepper } from '@/components/ui/Stepper';
import { Segmented } from '@/components/ui/Segmented';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Field } from '@/components/ui/Field';
import { useSheet } from '@/components/ui/Sheet';
import { toast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormRow } from './FormRow';
import styles from './ActivityForm.module.css';

const REPEAT_ITEMS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'weekly', label: 'Weekly' },
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type FieldKey = 'name' | 'picture' | 'chips' | 'where' | 'repeat' | 'goal' | 'steps';

/** Every draft step always has its own `id`, minted client-side at creation, so a
 * sub-step can reference it as `parent_step_id` right away (see SaveActivityStepInput). */
interface DraftStep extends SaveActivityStepInput {
  id: string;
}

function newDraftStep(parent_step_id: string | null): DraftStep {
  return { id: newId(), parent_step_id, name: '', emoji: null, photo_id: null, duration_minutes: null };
}

/** 0 for a root step, +1 per ancestor, walking `parent_step_id` through the flat draft list. */
function depthOf(steps: readonly DraftStep[], index: number): number {
  let depth = 0;
  let parentId = steps[index]?.parent_step_id ?? null;
  while (parentId) {
    depth += 1;
    const parentIndex = steps.findIndex((s) => s.id === parentId);
    parentId = parentIndex >= 0 ? (steps[parentIndex]?.parent_step_id ?? null) : null;
    if (depth > 20) break; // guards a corrupt/cyclic parent chain, never a real tree this deep
  }
  return depth;
}

/** The [start, end) slice of `index` and every descendant, given the list stays in
 * depth-first order (a step's children are always the run right after it). */
function subtreeRange(steps: readonly DraftStep[], index: number): [number, number] {
  const depth = depthOf(steps, index);
  let end = index + 1;
  while (end < steps.length && depthOf(steps, end) > depth) end += 1;
  return [index, end];
}

function siblingsOf(steps: readonly DraftStep[], parentId: string | null): DraftStep[] {
  return steps.filter((s) => (s.parent_step_id ?? null) === parentId);
}

/** Loaded `activity_steps` rows -> draft rows in depth-first order (reuses `stepTree`'s
 * per-parent position ordering rather than sorting the whole flat list by `position`,
 * which is only meaningful within one parent group). */
function toDraftSteps(activitySteps: readonly ActivityStep[]): DraftStep[] {
  const daySteps: DayStep[] = activitySteps.map((step) => ({ step, completed_at: null, completed_by: null, completion_id: null, depth: 0 }));
  const result: DraftStep[] = [];
  function walk(nodes: readonly StepNode[]): void {
    for (const node of nodes) {
      const s = node.node.step;
      result.push({ id: s.id, parent_step_id: s.parent_step_id, name: s.name, emoji: s.emoji, photo_id: s.photo_id, duration_minutes: s.duration_minutes });
      walk(node.children);
    }
  }
  walk(stepTree(daySteps));
  return result;
}

/** Draft rows with a blank name are dropped on save (pre-existing behaviour); their
 * whole sub-tree goes with them so a save never leaves a child pointing at a step
 * that no longer exists. */
function blankSubtreeIds(steps: readonly DraftStep[]): Set<string> {
  const drop = new Set<string>();
  steps.forEach((s, i) => {
    if (s.name.trim().length > 0) return;
    const [start, end] = subtreeRange(steps, i);
    for (let j = start; j < end; j += 1) drop.add((steps[j] as DraftStep).id);
  });
  return drop;
}

/** The in-progress draft, as a `StepNode` tree for the "Print visual schedule" preview —
 * there's no schedule item yet, so every node is simply un-done (readOnly hides the check
 * circles anyway). Blank rows are left out the same way a save would drop them. */
function draftStepTree(steps: readonly DraftStep[], activityId: string): StepNode[] {
  const drop = blankSubtreeIds(steps);
  const daySteps: DayStep[] = steps
    .filter((s) => !drop.has(s.id))
    .map((s, i) => ({
      step: {
        id: s.id,
        profile_id: '',
        version: 0,
        client_updated_at: 0,
        updated_by: '',
        deleted_at: null,
        activity_id: activityId,
        parent_step_id: s.parent_step_id ?? null,
        position: i,
        name: s.name,
        emoji: s.emoji,
        photo_id: s.photo_id,
        duration_minutes: s.duration_minutes,
      },
      completed_at: null,
      completed_by: null,
      completion_id: null,
      depth: 0,
    }));
  return stepTree(daySteps);
}

/** S9: edit/create activity page. Reads ?id= (edit) and ?add_to= (add the saved activity to that day). */
export function ActivityForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open, close } = useSheet();
  const editingId = searchParams.get('id');
  const addTo = searchParams.get('add_to');
  const routineParam = searchParams.get('routine') === '1';
  const { profile } = useActiveProfile();
  const profileId = profile?.id ?? '';
  const locations = useLocations(profileId);

  const activity = useActivity(editingId ?? '');

  const [name, setName] = useState('');
  const [picture, setPicture] = useState<PicturePickerValue>({ emoji: null, photo_id: null });
  // 1, not 0: the seeded activities are worth 1, and a routine a parent just built should earn something.
  const [chips, setChips] = useState(1);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<'none' | Recurrence>('none');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [recurrenceTime, setRecurrenceTime] = useState<string | null>(null);
  // Routine goal ("get to camp on time") and its reward (owner's doc, My Day 9).
  const [goalText, setGoalText] = useState('');
  const [goalRewardId, setGoalRewardId] = useState<string | null>(null);
  const goalReward = useLiveQuery(() => (goalRewardId ? db.rewards.get(goalRewardId) : undefined), [goalRewardId]);
  // New routine flow (?routine=1, no id yet): start with one empty step row, Steps expanded, ready to type into.
  const [steps, setSteps] = useState<DraftStep[]>(() => (routineParam && !editingId ? [newDraftStep(null)] : []));
  const [openField, setOpenField] = useState<FieldKey | null>(editingId ? null : routineParam ? 'steps' : 'name');
  const [saving, setSaving] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const seededRef = useRef(false);
  const rawSteps = useLiveQuery<ActivityStep[]>(
    () => (editingId ? db.activity_steps.where('activity_id').equals(editingId).toArray() : Promise.resolve([])),
    [editingId],
  );
  // The loaded activity's own steps (not the in-progress draft below), so the title stays put
  // as the user adds/removes step rows before saving.
  const loadedHasSteps = rawSteps !== undefined && rawSteps.some((s) => s.deleted_at === null);
  const isRoutineMode = routineParam || loadedHasSteps;

  useEffect(() => {
    if (!editingId || seededRef.current || !activity || rawSteps === undefined) return;
    seededRef.current = true;
    setName(activity.name);
    setPicture({ emoji: activity.emoji, photo_id: activity.photo_id });
    setChips(activity.chip_value);
    setLocationId(activity.location_id);
    setRepeat(activity.recurrence ?? 'none');
    setWeekdays(activity.recurrence_weekdays ?? []);
    setRecurrenceTime(activity.recurrence_time);
    setGoalText(activity.goal_text ?? '');
    setGoalRewardId(activity.goal_reward_id ?? null);
    const liveSteps = rawSteps.filter((s) => s.deleted_at === null);
    setSteps(toDraftSteps(liveSteps));
    setOpenField(liveSteps.length > 0 ? 'steps' : null);
  }, [editingId, activity, rawSteps]);

  function toggle(field: FieldKey): void {
    setOpenField((current) => (current === field ? null : field));
  }

  // Steps can be picked from the family's own activities, pictures included (the owner's beta built routines this way).
  const stepChoices = useActivities(profileId).filter((a) => a.id !== editingId);
  function addStepFrom(source: Activity): void {
    const picked = { name: source.name, emoji: source.emoji, photo_id: source.photo_id };
    setSteps((prev) => {
      const last = prev[prev.length - 1];
      // The new-routine flow opens with one blank step: fill that instead of leaving it empty above.
      if (last && !last.parent_step_id && !last.name.trim() && !last.emoji && !last.photo_id) return [...prev.slice(0, -1), { ...last, ...picked }];
      return [...prev, { ...newDraftStep(null), ...picked }];
    });
  }

  function addStep(): void {
    setSteps((prev) => [...prev, newDraftStep(null)]);
  }

  /** Inserts a new sub-step as the last child of `steps[index]` (S36 "Break down"). */
  function breakDown(index: number): void {
    const parent = steps[index];
    if (!parent) return;
    const [, end] = subtreeRange(steps, index);
    const child = newDraftStep(parent.id);
    setSteps((prev) => {
      const next = [...prev];
      next.splice(end, 0, child);
      return next;
    });
  }

  function toggleWeekday(day: number): void {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  function updateStep(index: number, patch: Partial<DraftStep>): void {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  /** Reorders `steps[index]` among its own siblings (S9 "sub-steps reorder among siblings"),
   * swapping the two adjacent sub-trees rather than a plain array-index swap, so a step
   * with children carries them along and never crosses into another parent's group. */
  function moveStep(index: number, direction: -1 | 1): void {
    setSteps((prev) => {
      const step = prev[index];
      if (!step) return prev;
      const siblings = siblingsOf(prev, step.parent_step_id ?? null);
      const pos = siblings.findIndex((s) => s.id === step.id);
      const otherId = siblings[pos + direction]?.id;
      if (otherId === undefined) return prev;
      const otherIndex = prev.findIndex((s) => s.id === otherId);
      const firstIndex = Math.min(index, otherIndex);
      const secondIndex = Math.max(index, otherIndex);
      const [firstStart, firstEnd] = subtreeRange(prev, firstIndex);
      const [, secondEnd] = subtreeRange(prev, secondIndex);
      const firstBlock = prev.slice(firstStart, firstEnd);
      const secondBlock = prev.slice(firstEnd, secondEnd);
      const next = [...prev];
      next.splice(firstStart, secondEnd - firstStart, ...secondBlock, ...firstBlock);
      return next;
    });
  }

  /** Mirrors the Rails routine steps that referenced activities: copies name/emoji/photo into the step. */
  function openFromActivity(index: number): void {
    open(
      <Picker
        kind="activity"
        profileId={profileId}
        title="Choose an activity"
        routines={false}
        onPick={(picked) => {
          const pickedActivity = picked as Activity;
          updateStep(index, { name: pickedActivity.name, emoji: pickedActivity.emoji, photo_id: pickedActivity.photo_id });
          close();
        }}
        // ponytail: "Create new" inside this nested picker has nowhere sensible to send you
        // mid-draft; closing back to the step you were editing is the safe default.
        onCreateNew={close}
      />,
      { title: 'Choose an activity' },
    );
  }

  /** Opens the reward picker for the routine goal, same "Working for" pattern as S10/S15.
   * ponytail: onCreateNew has nowhere sensible to send you mid-draft (same as openFromActivity
   * above); closing back to the form is the safe default. */
  function openGoalRewardPicker(): void {
    open(
      <Picker
        kind="reward"
        profileId={profileId}
        title="Reward for this goal"
        onPick={(item) => {
          setGoalRewardId(item.id);
          close();
        }}
        onCreateNew={close}
      />,
      { title: 'Reward for this goal' },
    );
  }

  /** Removes `steps[index]` and every sub-step under it (S9 "removing a step removes its sub-steps");
   * undo restores the whole removed block, sub-steps included, at the same position. */
  function removeStep(index: number): void {
    const removed = steps[index];
    if (!removed) return;
    const [start, end] = subtreeRange(steps, index);
    const removedBlock = steps.slice(start, end);
    const subStepCount = removedBlock.length - 1;
    const label = subStepCount > 0 ? `${removed.name || 'step'} and ${subStepCount} sub-step${subStepCount === 1 ? '' : 's'}` : removed.name || 'step';
    setSteps((prev) => prev.filter((_, i) => i < start || i >= end));
    toast(`Removed ${label}`, {
      undo: () => {
        setSteps((prev) => {
          const next = [...prev];
          next.splice(start, 0, ...removedBlock);
          return next;
        });
      },
    });
  }

  const weeklyNeedsDay = repeat === 'weekly' && weekdays.length === 0;

  async function onSave(): Promise<void> {
    if (!name.trim() || !profileId || saving || weeklyNeedsDay) return;
    setSaving(true);
    try {
      const id = await saveActivity({
        id: editingId ?? undefined,
        profile_id: profileId,
        name: name.trim(),
        emoji: picture.emoji ?? null,
        photo_id: picture.photo_id ?? null,
        chip_value: chips,
        location_id: locationId,
        recurrence: repeat === 'none' ? null : repeat,
        recurrence_weekdays: repeat === 'weekly' ? weekdays : null,
        recurrence_time: repeat === 'none' ? null : recurrenceTime,
        goal_text: goalText.trim() || null,
        goal_reward_id: goalRewardId,
        steps: (() => {
          const drop = blankSubtreeIds(steps);
          return steps
            .filter((s) => !drop.has(s.id))
            .map((s) => ({
              id: s.id,
              parent_step_id: s.parent_step_id ?? null,
              name: s.name.trim(),
              emoji: s.emoji,
              photo_id: s.photo_id,
              duration_minutes: s.duration_minutes,
            }));
        })(),
      });

      if (addTo) {
        await addToDay(profileId, addTo, id);
        router.push('/today/');
        return;
      }
      // ponytail: history.length > 1 is a good-enough "can go back" check; a
      // direct load (no history) falls through to the library list instead.
      if (typeof window !== 'undefined' && window.history.length > 1) router.back();
      else router.push('/settings/library/activities/');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(): Promise<void> {
    if (!editingId) return;
    await deleteActivity(editingId);
    const deletedId = editingId;
    const deletedName = name;
    toast(`Deleted ${deletedName}`, {
      undo: () => {
        void restore('activities', deletedId);
      },
    });
    router.push('/settings/library/activities/');
  }

  const locationItems = [{ value: '', label: 'Everywhere' }, ...locations.map((l) => ({ value: l.id, label: l.name }))];
  const locationLabel = locationId ? (locations.find((l) => l.id === locationId)?.name ?? 'Everywhere') : 'Everywhere';
  const repeatLabel = REPEAT_ITEMS.find((i) => i.value === repeat)?.label ?? 'None';

  const hasNamedSteps = steps.some((s) => s.name.trim().length > 0);

  return (
    <div className={styles.page}>
      <PageHeader
        title={editingId ? (isRoutineMode ? 'Edit routine' : 'Edit activity') : isRoutineMode ? 'New routine' : 'New activity'}
        compact
      />
      {hasNamedSteps ? (
        <div className={styles.headerRow}>
          <Button variant="ghost" size="md" icon="print" onClick={() => setShowSchedule(true)}>
            Print visual schedule
          </Button>
        </div>
      ) : null}

      <FormRow label="Name" summary={name || 'Required'} open={openField === 'name'} onToggle={() => toggle('name')}>
        <div className={styles.nameField}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
      </FormRow>

      <FormRow label="Picture" summary={<Picture emoji={picture.emoji} photo_id={picture.photo_id} name={name || 'Activity'} size="list" />} open={openField === 'picture'} onToggle={() => toggle('picture')}>
        <PicturePicker value={picture} onChange={setPicture} name={name || 'Activity'} />
      </FormRow>

      <FormRow label="Chips" summary={`${chips} chip${chips === 1 ? '' : 's'}`} open={openField === 'chips'} onToggle={() => toggle('chips')}>
        <Stepper label="Chips earned" value={chips} min={0} max={CHIP_MAX} onChange={setChips} />
      </FormRow>

      <FormRow label="Where" summary={locationLabel} open={openField === 'where'} onToggle={() => toggle('where')}>
        <Segmented label="Where" items={locationItems} value={locationId ?? ''} onChange={(v) => setLocationId(v || null)} />
      </FormRow>

      <FormRow label="Repeat" summary={repeatLabel} open={openField === 'repeat'} onToggle={() => toggle('repeat')}>
        <Segmented
          label="Repeat"
          items={REPEAT_ITEMS}
          value={repeat}
          onChange={(v) => setRepeat(v as 'none' | Recurrence)}
        />
        {repeat === 'weekly' ? (
          <>
            <div className={styles.weekdayRow} role="group" aria-label="Days of the week">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={weekdays.includes(i)}
                  aria-label={WEEKDAY_NAMES[i]}
                  className={[styles.weekdayButton, weekdays.includes(i) ? styles.weekdayActive : ''].filter(Boolean).join(' ')}
                  onClick={() => toggleWeekday(i)}
                >
                  {label}
                </button>
              ))}
            </div>
            {weeklyNeedsDay ? <p className={styles.weekdayError}>Pick at least one day</p> : null}
          </>
        ) : null}
        {repeat !== 'none' ? (
          <TextField label="Time" type="time" value={recurrenceTime ?? ''} onChange={(e) => setRecurrenceTime(e.target.value || null)} />
        ) : null}
      </FormRow>

      <FormRow
        label="Goal"
        summary={goalText || goalReward?.name || 'None'}
        open={openField === 'goal'}
        onToggle={() => toggle('goal')}
      >
        <TextField
          label="Goal (optional)"
          placeholder="Get to camp on time"
          value={goalText}
          onChange={(e) => setGoalText(e.target.value)}
        />
        <Field label="Reward for this goal">
          {goalReward ? (
            <div className={styles.goalRewardRow}>
              <button type="button" className={styles.goalRewardPick} onClick={openGoalRewardPicker}>
                <Picture emoji={goalReward.emoji} photo_id={goalReward.photo_id} name={goalReward.name} size="list" />
                <span>{goalReward.name}</span>
              </button>
              <Button variant="ghost" onClick={() => setGoalRewardId(null)}>
                Clear
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={openGoalRewardPicker}>
              Choose a reward
            </Button>
          )}
        </Field>
      </FormRow>

      <FormRow label="Steps" summary={steps.length > 0 ? `${steps.length} step${steps.length === 1 ? '' : 's'}` : 'None'} open={openField === 'steps'} onToggle={() => toggle('steps')}>
        <div className={styles.steps}>
          {steps.map((step, i) => {
            const depth = depthOf(steps, i);
            const siblings = siblingsOf(steps, step.parent_step_id ?? null);
            const siblingPos = siblings.findIndex((s) => s.id === step.id);
            return (
              <div
                key={step.id}
                className={styles.stepRow}
                style={depth > 0 ? ({ '--depth': depth } as CSSProperties) : undefined}
              >
                <Picture emoji={step.emoji} photo_id={step.photo_id} name={step.name || 'Step'} size="list" />
                <div className={styles.stepMain}>
                  <TextField
                    label={`Step ${i + 1}`}
                    value={step.name}
                    onChange={(e) => updateStep(i, { name: e.target.value })}
                    className={styles.stepInput}
                    autoFocus={routineParam && !editingId && i === 0}
                  />
                  <div className={styles.stepRow2}>
                    <button type="button" className={styles.fromActivityButton} onClick={() => openFromActivity(i)}>
                      Change picture
                    </button>
                    {depth < 2 ? (
                      <button type="button" className={styles.fromActivityButton} onClick={() => breakDown(i)}>
                        Add sub-steps
                      </button>
                    ) : null}
                    <TextField
                      label={`Minutes for step ${i + 1}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={120}
                      className={styles.durationInput}
                      value={step.duration_minutes ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateStep(i, { duration_minutes: raw === '' ? null : Math.max(1, Math.min(120, Number(raw))) });
                      }}
                    />
                    <span className={styles.durationUnit} aria-hidden="true">
                      min
                    </span>
                  </div>
                </div>
                <div className={styles.stepActions}>
                  <IconButton
                    icon="chevron"
                    aria-label={`Move step ${i + 1} up`}
                    className={styles.rotateUp}
                    disabled={siblingPos <= 0}
                    onClick={() => moveStep(i, -1)}
                  />
                  <IconButton
                    icon="chevron"
                    aria-label={`Move step ${i + 1} down`}
                    className={styles.rotateDown}
                    disabled={siblingPos < 0 || siblingPos >= siblings.length - 1}
                    onClick={() => moveStep(i, 1)}
                  />
                  <IconButton icon="close" aria-label={`Remove step ${i + 1}`} onClick={() => removeStep(i)} />
                </div>
              </div>
            );
          })}
          {stepChoices.length > 0 ? (
            <>
              <p className={styles.stepGridLabel}>Tap an activity to add it as a step</p>
              <div className={styles.stepGrid}>
                {stepChoices.map((a) => (
                  <button key={a.id} type="button" className={styles.stepChoice} onClick={() => addStepFrom(a)}>
                    <Picture emoji={a.emoji} photo_id={a.photo_id} name={a.name} size="list" />
                    <span className={styles.stepChoiceName}>{a.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <BigButton variant="secondary" icon="plus" onClick={addStep}>
            Type a new step
          </BigButton>
        </div>
      </FormRow>

      <div className={styles.saveBar}>
        <BigButton variant="primary" fullWidth disabled={!name.trim() || saving || weeklyNeedsDay} onClick={() => void onSave()}>
          Save
        </BigButton>
      </div>

      {editingId ? (
        <button type="button" className={styles.deleteLink} onClick={() => void onDelete()}>
          Delete activity
        </button>
      ) : null}

      {showSchedule ? (
        <VisualSchedule
          title={name || 'Activity'}
          picture={picture}
          nodes={draftStepTree(steps, editingId ?? '')}
          onToggle={() => {}}
          onClose={() => setShowSchedule(false)}
          readOnly
        />
      ) : null}
    </div>
  );
}
