'use client';

import { useId, useRef, useState, type ChangeEvent } from 'react';
import { DEFAULT_EVENT_REMIND_HOUR, type DayEvent, type EventRecurrence } from '@chipperly/shared/schemas/event';
import { deleteEvent, saveEvent } from '@/lib/data/events';
import { useStories } from '@/lib/data/stories';
import { pickAndStoreImage } from '@/lib/data/media';
import { toast } from '@/lib/toast';
import { Field } from '@/components/ui/Field';
import { TextField } from '@/components/ui/TextField';
import { Segmented } from '@/components/ui/Segmented';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { useSheet } from '@/components/ui/Sheet';
import { StoryPickerSheet } from '@/components/schedule/StoryPickerSheet';
import { weekdayName } from '@/components/schedule/todayModel';
import { EventPicture } from './EventPicture';
import styles from './EventSheet.module.css';

export interface EventSheetProps {
  profileId: string;
  /** The day the sheet was opened for: the date of a new event. */
  isoDate: string;
  /** The event being edited; omitted to add a new one. */
  event?: DayEvent;
}

/** The owner's own examples, one tap to fill the title and picture. */
const PRESETS: readonly { title: string; emoji: string }[] = [
  { title: 'Short day at school', emoji: '🏫' },
  { title: 'Doctor appointment', emoji: '🩺' },
  { title: 'Crazy hair day', emoji: '🤪' },
  { title: 'Visiting family', emoji: '👨‍👩‍👧' },
  { title: 'Different outfit', emoji: '👕' },
  { title: 'Big event', emoji: '🎉' },
];

const REPEAT_ITEMS = [
  { value: 'none', label: 'Just this day' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'weekly', label: 'Every week' },
  { value: 'yearly', label: 'Every year' },
];

const REMIND_ITEMS = [
  { value: '0', label: 'No reminder' },
  { value: '1', label: 'The day before' },
  { value: '3', label: 'Each of 3 days before' },
  { value: '7', label: 'Each of 7 days before' },
];

/** Sensible times for the morning push; a saved hour outside the list is added so it still shows. */
const REMIND_HOURS = [6, 7, 8, 9, 12, 18];

function hourLabel(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Add or edit one day event: a title and picture, when it happens, what to wear, a story, and reminders. */
export function EventSheet({ profileId, isoDate, event }: EventSheetProps) {
  const { close, open, back } = useSheet();
  const stories = useStories(profileId);
  const noteId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(event?.title ?? '');
  const [emoji, setEmoji] = useState(event?.emoji ?? null);
  const [photoId, setPhotoId] = useState(event?.photo_id ?? null);
  const [date, setDate] = useState(event?.date ?? isoDate);
  const [repeat, setRepeat] = useState<string>(event?.recurrence ?? 'none');
  const [weekdays, setWeekdays] = useState<number[]>(event?.recurrence_weekdays ?? []);
  const [time, setTime] = useState(event?.start_time ?? '');
  const [wear, setWear] = useState(event?.what_to_wear ?? '');
  const [note, setNote] = useState(event?.note ?? '');
  const [storyId, setStoryId] = useState(event?.story_id ?? null);
  const [remind, setRemind] = useState(String(event?.remind_days_before ?? 0));
  const [remindHour, setRemindHour] = useState(String(event?.remind_hour ?? DEFAULT_EVENT_REMIND_HOUR));
  const hourItems = [...new Set([...REMIND_HOURS, Number(remindHour)])].sort((a, b) => a - b).map((h) => ({ value: String(h), label: hourLabel(h) }));

  const story = stories.find((s) => s.id === storyId);
  const canSave = title.trim().length > 0 && date.length === 10;

  async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhotoId(await pickAndStoreImage(file));
    } catch {
      toast("Couldn't add that photo. Try again.");
    }
  }

  function toggleWeekday(day: number): void {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  function pickStory(): void {
    open(
      <StoryPickerSheet
        profileId={profileId}
        currentStoryId={storyId}
        onPick={(next) => {
          setStoryId(next);
          back();
        }}
      />,
      { title: 'Story' },
    );
  }

  async function onSave(): Promise<void> {
    await saveEvent({
      id: event?.id,
      profile_id: profileId,
      title,
      emoji,
      photo_id: photoId,
      note,
      what_to_wear: wear,
      story_id: storyId,
      date,
      start_time: time || null,
      recurrence: repeat === 'none' ? null : (repeat as EventRecurrence),
      recurrence_weekdays: repeat === 'weekly' && weekdays.length > 0 ? weekdays : null,
      remind_days_before: Number(remind),
      remind_hour: Number(remindHour),
    });
    close();
  }

  async function onDelete(): Promise<void> {
    if (event) await deleteEvent(event.id);
    close();
  }

  return (
    <div className={styles.sheet}>
      {event ? null : (
        <div className={styles.presets} role="group" aria-label="Quick picks">
          {PRESETS.map((preset) => (
            <button
              key={preset.title}
              type="button"
              className={styles.preset}
              onClick={() => {
                setTitle(preset.title);
                setEmoji(preset.emoji);
              }}
            >
              <span aria-hidden="true">{preset.emoji}</span> {preset.title}
            </button>
          ))}
        </div>
      )}

      <TextField label="What is happening" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Doctor appointment" />

      <div className={styles.photoRow}>
        <EventPicture emoji={emoji} photoId={photoId} title={title || 'Event'} size="list" />
        <Button variant="secondary" icon="camera" onClick={() => fileRef.current?.click()}>
          {photoId ? 'Change photo' : 'Add a photo'}
        </Button>
        {photoId || emoji ? (
          <Button
            variant="ghost"
            onClick={() => {
              setPhotoId(null);
              setEmoji(null);
            }}
          >
            Remove picture
          </Button>
        ) : null}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e)} />

      <Field label="How often">
        <Segmented items={REPEAT_ITEMS} value={repeat} onChange={setRepeat} label="How often" />
      </Field>
      {repeat === 'weekly' ? (
        <div className={styles.weekdays} role="group" aria-label="Days of the week">
          {WEEKDAY_LETTERS.map((letter, day) => (
            <button
              key={WEEKDAY_NAMES[day]}
              type="button"
              aria-pressed={weekdays.includes(day)}
              aria-label={WEEKDAY_NAMES[day]}
              className={[styles.day, weekdays.includes(day) ? styles.dayOn : ''].filter(Boolean).join(' ')}
              onClick={() => toggleWeekday(day)}
            >
              {letter}
            </button>
          ))}
        </div>
      ) : null}
      <TextField
        label={repeat === 'none' ? 'Day' : repeat === 'yearly' ? 'First day (repeats on this date every year)' : 'Starting'}
       
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        hint={date.length === 10 ? weekdayName(date) : undefined}
      />
      <TextField label="Time (optional)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />

      <TextField label="What to wear (optional)" maxLength={120} value={wear} onChange={(e) => setWear(e.target.value)} placeholder="Blue jumper, school shoes" />
      <Field label="Note (optional)" htmlFor={noteId}>
        <textarea id={noteId} className={styles.textarea} rows={3} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <Field label="Social story (optional)">
        <div className={styles.storyRow}>
          <Button variant="secondary" onClick={pickStory}>
            {story ? story.title : 'Add a story'}
          </Button>
          {story ? (
            <Button variant="ghost" onClick={() => setStoryId(null)}>
              Remove story
            </Button>
          ) : null}
        </div>
      </Field>

      <Field label="Reminder" hint="A morning notification, shown on Today until you remove it.">
        <Segmented items={REMIND_ITEMS} value={remind} onChange={setRemind} label="Reminder" />
      </Field>
      {remind === '0' ? null : (
        <Field label="Reminder time">
          <Segmented items={hourItems} value={remindHour} onChange={setRemindHour} label="Reminder time" />
        </Field>
      )}

      <BigButton variant="primary" fullWidth disabled={!canSave} onClick={() => void onSave()}>
        Save
      </BigButton>
      {event ? (
        <Button variant="danger" fullWidth onClick={() => void onDelete()}>
          Delete event
        </Button>
      ) : null}
    </div>
  );
}
