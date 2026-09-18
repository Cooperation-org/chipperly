'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { todayIso } from '@chipperly/shared/helpers/date';
import { useLock } from '@/lib/device/settings';
import { useSession } from '@/lib/auth/session';
import { db } from '@/lib/db/db';
import {
  materializeRecurringFresh,
  setCompleted,
  setStepCompleted,
  stepTree,
  useDayItems,
  type DayItem,
  type StepNode,
} from '@/lib/data/schedule';
import { useActiveLocation, useLocations } from '@/lib/data/locations';
import { useWorkingFor } from '@/lib/data/chips';
import { useTimer, useTimerRunning, setDuration, start } from '@/lib/timer/store';
import { playChip } from '@/lib/sound';
import { Picture } from '@/components/media/Picture';
import { ChipStrip } from '@/components/ui/ChipStrip';
import { ChipBoard } from '@/components/ui/ChipBoard';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { StepRow } from '@/components/ui/StepRow';
import { IconButton } from '@/components/ui/IconButton';
import { BigButton } from '@/components/ui/BigButton';
import { Celebration } from '@/components/ui/Celebration';
import { useSheet } from '@/components/ui/Sheet';
import { FreeTimeSheet } from '@/components/chips/FreeTimeSheet';
import { FirstThenPanels } from '@/components/firstThen/FirstThenPanels';
import { TimerFullScreen } from '@/components/timer/TimerFullScreen';
import { formatTimerTime } from '@/components/timer/time';
import { ChipperChartSheet } from '@/components/chipperChart/ChipperChartSheet';
import { VisualSchedule } from '@/components/schedule/VisualSchedule';
import { AttitudePrompt } from './AttitudePrompt';
import { UnlockOverlay } from './UnlockOverlay';
import styles from './ChildToday.module.css';

// ponytail: same one-run-per-session guard TodayScreen uses; a kv/db dedupe
// table would be more correct but this is enough for a screen that opens once.
const materializedDates = new Set<string>();

/**
 * S32: the child's locked Today screen. One list, big pictures, nothing to
 * navigate. `ChildShell` guarantees `locked_profile_id` is set before this
 * mounts (it redirects to /today/ otherwise), so the early return below is
 * only a defensive fallback for the first render tick.
 */
export function ChildToday() {
  const { locked_profile_id, options } = useLock();
  const { user } = useSession();
  const sheet = useSheet();
  // Selector hook, not useTimer(): the full TimerState changes ~60x/sec while
  // a timer runs, and re-executing this whole screen's body on every tick
  // (dayItems.map, chip strip, header) is the P1 this avoids. The one thing
  // that needs the live remaining_ms is isolated in TimerRemaining below.
  const running = useTimerRunning();

  const profileId = locked_profile_id ?? '';
  const userId = user?.id ?? '';
  const [isoDate] = useState(() => todayIso());

  const profile = useLiveQuery(() => (profileId ? db.profiles.get(profileId) : undefined), [profileId]);
  const dayItems = useDayItems(profileId, isoDate);
  const { location: activeLocation, setActiveLocationId } = useActiveLocation(profileId);
  const locations = useLocations(profileId);
  const workingFor = useWorkingFor(profileId, activeLocation?.id ?? null);

  useEffect(() => {
    if (!profileId) return;
    const key = `${profileId}:${isoDate}`;
    if (materializedDates.has(key)) return;
    materializedDates.add(key);
    void materializeRecurringFresh(profileId, isoDate);
  }, [profileId, isoDate]);

  // Best-effort back-gesture trap: every back navigation just re-pushes the
  // same entry, so there is nowhere for "back" to go while locked.
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    function onPopState(): void {
      window.history.pushState(null, '', window.location.href);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Belt for the CSS overscroll-behavior on .screen: some browsers only
  // honor pull-to-refresh suppression set on the document root.
  useEffect(() => {
    const prev = document.documentElement.style.overscrollBehaviorY;
    document.documentElement.style.overscrollBehaviorY = 'contain';
    return () => {
      document.documentElement.style.overscrollBehaviorY = prev;
    };
  }, []);

  // Screen stays awake while a timer runs, whether or not the full-screen
  // timer overlay is open (S32 "Screen stays awake while a timer runs").
  useEffect(() => {
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;
    async function acquire(): Promise<void> {
      if (!running || !('wakeLock' in navigator)) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) void sentinel.release();
      } catch {
        // ponytail: best effort only; the screen may just sleep here.
      }
    }
    void acquire();
    return () => {
      cancelled = true;
      void sentinel?.release();
    };
  }, [running]);

  const [unlocking, setUnlocking] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [promptIds, setPromptIds] = useState<ReadonlySet<string>>(new Set());
  const [celebrating, setCelebrating] = useState(false);
  const wasAllDoneRef = useRef(false);
  // The item id whose steps are open as a full-screen visual schedule (S36), or null.
  const [scheduleItemId, setScheduleItemId] = useState<string | null>(null);
  const scheduleDay = scheduleItemId ? dayItems.find((d) => d.item.id === scheduleItemId) : undefined;

  const isAllDone = dayItems.length > 0 && dayItems.every((day) => day.item.completed_at !== null);
  useEffect(() => {
    if (isAllDone && !wasAllDoneRef.current) setCelebrating(true);
    wasAllDoneRef.current = isAllDone;
  }, [isAllDone]);

  function showPromptFor(itemId: string): void {
    if (!options.attitude_prompt) return;
    setPromptIds((prev) => new Set(prev).add(itemId));
  }

  function hidePromptFor(itemId: string): void {
    setPromptIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }

  async function handleToggle(day: DayItem, next: boolean): Promise<void> {
    await setCompleted(day.item.id, next, userId);
    if (!next) return;
    if (day.activity.chip_value > 0) playChip();
    showPromptFor(day.item.id);
  }

  // Predicts whether checking this one step completes the parent (the same
  // rule setStepCompleted applies), so the sound/prompt can fire alongside it.
  function stepCompletesParent(day: DayItem, stepId: string, next: boolean): boolean {
    if (!next || day.item.completed_at !== null || day.steps.length === 0) return false;
    return day.steps.every((s) => (s.step.id === stepId ? true : s.completed_at !== null));
  }

  async function handleStepToggle(day: DayItem, stepId: string, next: boolean): Promise<void> {
    const completesParent = stepCompletesParent(day, stepId, next);
    await setStepCompleted(day.item.id, stepId, next, userId);
    if (!completesParent) return;
    if (day.activity.chip_value > 0) playChip();
    showPromptFor(day.item.id);
  }

  // ponytail: opens the same full-screen timer already used for the running-timer
  // pill below instead of routing to /timer/ — this screen traps back-navigation
  // and has no nav chrome to return from, so leaving the route would strand the child.
  function startStepTimer(minutes: number): void {
    setDuration(minutes * 60_000);
    start();
    setTimerOpen(true);
  }

  // SOW Q3, decided: a lock option lets the child pick their own location
  // from their header, big picture tiles, no text-only choices.
  function openLocationPicker(): void {
    sheet.open(
      <ul className={styles.locationList}>
        {locations.map((loc) => (
          <li key={loc.id}>
            <button
              type="button"
              className={styles.locationTile}
              aria-label={loc.name}
              onClick={() => {
                setActiveLocationId(loc.id);
                sheet.close();
              }}
            >
              <Picture emoji={loc.emoji} photo_id={loc.photo_id} name={loc.name} size="child" />
              <span>{loc.name}</span>
            </button>
          </li>
        ))}
      </ul>,
      { title: 'Choose location' },
    );
  }

  // Child mode never collapses (S32 "steps shown expanded"): the lock option
  // just gates whether the tree shows at all, so every level renders here.
  function renderStepNode(day: DayItem, node: StepNode): ReactNode {
    const step = node.node.step;
    return (
      <li key={step.id}>
        <StepRow
          tile={<Picture emoji={step.emoji} photo_id={step.photo_id} name={step.name} size="child" />}
          name={step.name}
          checked={node.done}
          onChange={(next) => void handleStepToggle(day, step.id, next)}
          durationMinutes={step.duration_minutes}
          depth={node.node.depth}
          onStartTimer={
            options.show_step_timers && step.duration_minutes ? () => startStepTimer(step.duration_minutes as number) : undefined
          }
        />
        {node.children.length > 0 ? (
          <ul className={styles.steps}>{node.children.map((child) => renderStepNode(day, child))}</ul>
        ) : null}
      </li>
    );
  }

  function openWorkingFor(): void {
    sheet.open(
      <div className={styles.workingForSheet}>
        {workingFor.reward ? (
          <div className={styles.workingForReward}>
            <Picture emoji={workingFor.reward.emoji} photo_id={workingFor.reward.photo_id} name={workingFor.reward.name} size="grid" />
            <span>{workingFor.reward.name}</span>
          </div>
        ) : null}
        <ChipBoard filled={workingFor.filled} total={workingFor.goal} />
      </div>,
      { title: 'Chips' },
    );
  }

  const showBottomBar = options.show_free_time || options.show_first_then || options.show_chipper_chart || running;

  if (!profileId || !profile) return null;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <Picture emoji={profile.avatar_emoji} photo_id={profile.avatar_photo_id} name={profile.name} size="child" />
          <h1 className={styles.name}>{profile.name}</h1>
        </div>
        {options.allow_child_location && locations.length > 0 ? (
          <button type="button" className={styles.locationButton} onClick={openLocationPicker}>
            {activeLocation?.name ?? 'Location'}
          </button>
        ) : null}
        {workingFor.reward || workingFor.filled > 0 ? (
          <ChipStrip
            filled={workingFor.filled}
            total={workingFor.goal}
            reward={
              workingFor.reward
                ? { emoji: workingFor.reward.emoji ?? undefined, photo_id: workingFor.reward.photo_id, name: workingFor.reward.name }
                : undefined
            }
            onTap={openWorkingFor}
          />
        ) : null}
        <IconButton
          icon="lock"
          aria-label="Caregiver unlock"
          variant="solid"
          className={styles.lockButton}
          onClick={() => setUnlocking(true)}
        />
      </header>

      {dayItems.length === 0 ? (
        <p className={styles.emptyText}>Nothing planned for today</p>
      ) : (
        <div className={styles.list}>
          {dayItems.map((day) => {
            const dimmed = day.item.completed_at !== null;
            return (
              <div key={day.item.id} className={styles.card}>
                <div className={styles.row}>
                  <Picture emoji={day.activity.emoji} photo_id={day.activity.photo_id} name={day.activity.name} size="child" />
                  <span className={[styles.rowName, dimmed ? styles.dimmed : ''].filter(Boolean).join(' ')}>
                    {day.activity.name}
                  </span>
                  <CheckCircle
                    checked={dimmed}
                    name={day.activity.name}
                    size="lg"
                    onChange={(next) => void handleToggle(day, next)}
                  />
                </div>

                {day.steps.length > 0 && options.show_visual_schedule ? (
                  <BigButton variant="secondary" icon="expand" onClick={() => setScheduleItemId(day.item.id)}>
                    Steps
                  </BigButton>
                ) : null}

                {options.expand_steps && day.steps.length > 0 ? (
                  <ul className={styles.steps}>{stepTree(day.steps).map((node) => renderStepNode(day, node))}</ul>
                ) : null}

                {promptIds.has(day.item.id) ? (
                  <AttitudePrompt profileId={profileId} itemId={day.item.id} onDone={() => hidePromptFor(day.item.id)} />
                ) : null}
              </div>
            );
          })}

          {isAllDone ? (
            <div className={styles.allDoneCard}>
              <span className={styles.allDoneEmoji} aria-hidden="true">
                🎉
              </span>
              <p className={styles.allDoneText}>All done!</p>
            </div>
          ) : null}
        </div>
      )}

      {celebrating ? (
        <div className={styles.celebrationWrap}>
          <Celebration kind="all_done" onDone={() => setCelebrating(false)} />
        </div>
      ) : null}

      {showBottomBar ? (
        <div className={styles.bottomBar}>
          {options.show_free_time ? (
            <BigButton
              variant="secondary"
              onClick={() =>
                sheet.open(<FreeTimeSheet profileId={profileId} locationId={activeLocation?.id ?? null} canCreate={false} />, {
                  title: 'Free time',
                })
              }
            >
              <span className={styles.emojiGlyph} aria-hidden="true">
                🎈
              </span>
              Free time
            </BigButton>
          ) : null}
          {running ? (
            <BigButton variant="accent" icon="timer" onClick={() => setTimerOpen(true)}>
              <TimerRemaining />
            </BigButton>
          ) : null}
          {options.show_first_then ? (
            <BigButton
              variant="secondary"
              icon="split"
              onClick={() => sheet.open(<FirstThenPanels profileId={profileId} mode="child" />, { title: 'First, then' })}
            >
              First, then
            </BigButton>
          ) : null}
          {options.show_chipper_chart ? (
            <BigButton
              variant="secondary"
              onClick={() =>
                sheet.open(<ChipperChartSheet profileId={profileId} userId={userId} />, { title: 'Chipper Chart' })
              }
            >
              <span className={styles.emojiGlyph} aria-hidden="true">
                😊
              </span>
              Chipper Chart
            </BigButton>
          ) : null}
        </div>
      ) : null}

      {timerOpen ? <TimerFullScreen onClose={() => setTimerOpen(false)} /> : null}
      {unlocking ? <UnlockOverlay onClose={() => setUnlocking(false)} /> : null}
      {scheduleDay ? (
        <VisualSchedule
          title={scheduleDay.activity.name}
          picture={{ emoji: scheduleDay.activity.emoji, photo_id: scheduleDay.activity.photo_id }}
          nodes={stepTree(scheduleDay.steps)}
          onToggle={(stepId, next) => void handleStepToggle(scheduleDay, stepId, next)}
          onClose={() => setScheduleItemId(null)}
        />
      ) : null}
    </div>
  );
}

/** Leaf that reads the ticking `remaining_ms` itself (TimerPill's pattern), so only this re-renders per tick. */
function TimerRemaining() {
  const timer = useTimer();
  return <>{formatTimerTime(timer.remaining_ms)}</>;
}
