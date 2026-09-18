'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Activity, ActivityStep, Recurrence } from '@chipperly/shared/schemas/activity';
import { CHIP_MAX } from '@chipperly/shared/constants/limits';
import { db } from '@/lib/db/db';
import { deleteActivity, saveActivity, useActivity, type SaveActivityStepInput } from '@/lib/data/activities';
import { addToDay } from '@/lib/data/schedule';
import { useLocations } from '@/lib/data/locations';
import { useActiveProfile } from '@/lib/profile/active';
import { restore } from '@/lib/sync/mutate';
import { newId } from '@/lib/ids';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { Picture } from '@/components/media/Picture';
import { Picker } from '@/components/picker/Picker';
import { TextField } from '@/components/ui/TextField';
import { Stepper } from '@/components/ui/Stepper';
import { Segmented } from '@/components/ui/Segmented';
import { BigButton } from '@/components/ui/BigButton';
import { IconButton } from '@/components/ui/IconButton';
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

type FieldKey = 'name' | 'picture' | 'chips' | 'where' | 'repeat' | 'steps';

interface DraftStep extends SaveActivityStepInput {
  key: string;
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
  const [chips, setChips] = useState(0);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<'none' | Recurrence>('none');
  const [weekday, setWeekday] = useState(0);
  const [recurrenceTime, setRecurrenceTime] = useState<string | null>(null);
  // New routine flow (?routine=1, no id yet): start with one empty step row, Steps expanded, ready to type into.
  const [steps, setSteps] = useState<DraftStep[]>(() =>
    routineParam && !editingId ? [{ key: newId(), name: '', emoji: null, photo_id: null }] : [],
  );
  const [openField, setOpenField] = useState<FieldKey | null>(editingId ? null : routineParam ? 'steps' : 'name');
  const [saving, setSaving] = useState(false);

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
    setWeekday(activity.recurrence_weekday ?? 0);
    setRecurrenceTime(activity.recurrence_time);
    const liveSteps = rawSteps.filter((s) => s.deleted_at === null).sort((a, b) => a.position - b.position);
    setSteps(liveSteps.map((s) => ({ key: s.id, id: s.id, name: s.name, emoji: s.emoji, photo_id: s.photo_id })));
    setOpenField(liveSteps.length > 0 ? 'steps' : null);
  }, [editingId, activity, rawSteps]);

  function toggle(field: FieldKey): void {
    setOpenField((current) => (current === field ? null : field));
  }

  function addStep(): void {
    setSteps((prev) => [...prev, { key: newId(), name: '', emoji: null, photo_id: null }]);
  }

  function updateStep(index: number, patch: Partial<DraftStep>): void {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function moveStep(index: number, direction: -1 | 1): void {
    const to = index + direction;
    if (to < 0 || to >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(to, 0, moved as DraftStep);
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

  function removeStep(index: number): void {
    const removed = steps[index];
    if (!removed) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
    toast(`Removed ${removed.name || 'step'}`, {
      undo: () => {
        setSteps((prev) => {
          const next = [...prev];
          next.splice(index, 0, removed);
          return next;
        });
      },
    });
  }

  async function onSave(): Promise<void> {
    if (!name.trim() || !profileId || saving) return;
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
        recurrence_weekday: repeat === 'weekly' ? weekday : null,
        recurrence_time: repeat === 'none' ? null : recurrenceTime,
        steps: steps
          .filter((s) => s.name.trim().length > 0)
          .map((s) => ({ id: s.id, name: s.name.trim(), emoji: s.emoji, photo_id: s.photo_id })),
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

  return (
    <div className={styles.page}>
      <PageHeader
        title={editingId ? (isRoutineMode ? 'Edit routine' : 'Edit activity') : isRoutineMode ? 'New routine' : 'New activity'}
      />

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
          <div className={styles.weekdayRow} role="radiogroup" aria-label="Day of the week">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={weekday === i}
                aria-label={WEEKDAY_NAMES[i]}
                className={[styles.weekdayButton, weekday === i ? styles.weekdayActive : ''].filter(Boolean).join(' ')}
                onClick={() => setWeekday(i)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {repeat !== 'none' ? (
          <TextField label="Time" type="time" value={recurrenceTime ?? ''} onChange={(e) => setRecurrenceTime(e.target.value || null)} />
        ) : null}
      </FormRow>

      <FormRow label="Steps" summary={steps.length > 0 ? `${steps.length} step${steps.length === 1 ? '' : 's'}` : 'None'} open={openField === 'steps'} onToggle={() => toggle('steps')}>
        <div className={styles.steps}>
          {steps.map((step, i) => (
            <div key={step.key} className={styles.stepRow}>
              <Picture emoji={step.emoji} photo_id={step.photo_id} name={step.name || 'Step'} size="list" />
              <div className={styles.stepMain}>
                <TextField
                  label={`Step ${i + 1}`}
                  value={step.name}
                  onChange={(e) => updateStep(i, { name: e.target.value })}
                  className={styles.stepInput}
                  autoFocus={routineParam && !editingId && i === 0}
                />
                <button type="button" className={styles.fromActivityButton} onClick={() => openFromActivity(i)}>
                  From activity
                </button>
              </div>
              <div className={styles.stepActions}>
                <IconButton icon="chevron" aria-label={`Move step ${i + 1} up`} className={styles.rotateUp} disabled={i === 0} onClick={() => moveStep(i, -1)} />
                <IconButton icon="chevron" aria-label={`Move step ${i + 1} down`} className={styles.rotateDown} disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} />
                <IconButton icon="close" aria-label={`Remove step ${i + 1}`} onClick={() => removeStep(i)} />
              </div>
            </div>
          ))}
          <BigButton variant="secondary" icon="plus" onClick={addStep}>
            Add step
          </BigButton>
        </div>
      </FormRow>

      <div className={styles.saveBar}>
        <BigButton variant="primary" fullWidth disabled={!name.trim() || saving} onClick={() => void onSave()}>
          Save
        </BigButton>
      </div>

      {editingId ? (
        <button type="button" className={styles.deleteLink} onClick={() => void onDelete()}>
          Delete activity
        </button>
      ) : null}
    </div>
  );
}
