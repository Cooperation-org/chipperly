'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import { todayIso } from '@chipperly/shared/helpers/date';
import { useLock } from '@/lib/device/settings';
import { useSession } from '@/lib/auth/session';
import { useActiveProfile } from '@/lib/profile/active';
import { verifyPin } from '@/lib/auth/pin';
import { PinPad } from '@/components/pin/PinPad';
import { db } from '@/lib/db/db';
import {
  useMaterializedDay,
  setCompleted,
  setStepCompleted,
  stepTree,
  useDayItems,
  type DayItem,
  type StepNode,
} from '@/lib/data/schedule';
import { useActiveLocation, useLocations } from '@/lib/data/locations';
import { useWorkingFor } from '@/lib/data/chips';
import { useMediaUrl } from '@/lib/data/media';
import { useTimer, useTimerRunning, setDuration, setReveal, setLocked, start } from '@/lib/timer/store';
import { playChip } from '@/lib/sound';
import { now } from '@/lib/clock';
import { Picture } from '@/components/media/Picture';
import { ChipStrip } from '@/components/ui/ChipStrip';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { StepRow } from '@/components/ui/StepRow';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { BigButton } from '@/components/ui/BigButton';
import { Celebration } from '@/components/ui/Celebration';
import { useSheet } from '@/components/ui/Sheet';
import { FreeTimeSheet } from '@/components/chips/FreeTimeSheet';
import { PickRewardSheet } from './PickRewardSheet';
import { WorkingForSheet } from './WorkingForSheet';
import { FirstThenPanels } from '@/components/firstThen/FirstThenPanels';
import { TimerFullScreen } from '@/components/timer/TimerFullScreen';
import { formatTimerTime } from '@/components/timer/time';
import { ChipperChartSheet } from '@/components/chipperChart/ChipperChartSheet';
import { VisualSchedule } from '@/components/schedule/VisualSchedule';
import { AttitudePrompt } from './AttitudePrompt';
import { DayBand } from './DayBand';
import { ReadStoryButton } from './ReadStoryButton';
import { TomorrowBand } from './TomorrowBand';
import { UnlockOverlay } from './UnlockOverlay';
import { AllowedAppsSheet } from './AllowedAppsSheet';
import styles from './ChildToday.module.css';

/**
 * S32: the child's Today screen -- the app's default view (lib/device/settings.ts's
 * useParentMode), shown whether or not the device is hard-locked. When
 * hard-locked (hardware screen pinning, `locked_profile_id`), that's the
 * profile shown; otherwise it's the caregiver's own active profile, same one
 * CaregiverShell's profile switcher uses. Either way the "Caregiver unlock"
 * lock button is the one way into caregiver screens (UnlockOverlay, PIN or
 * password).
 */
export function ChildToday() {
  const { locked_profile_id, options } = useLock();
  const { user } = useSession();
  const { profile: activeProfile } = useActiveProfile();
  const sheet = useSheet();
  // Selector hook, not useTimer(): the full TimerState changes ~60x/sec while
  // a timer runs, and re-executing this whole screen's body on every tick
  // (dayItems.map, chip strip, header) is the P1 this avoids. The one thing
  // that needs the live remaining_ms is isolated in TimerRemaining below.
  const running = useTimerRunning();

  const profileId = locked_profile_id ?? activeProfile?.id ?? '';
  const userId = user?.id ?? '';
  const [isoDate] = useState(() => todayIso());

  const profile = useLiveQuery(() => (profileId ? db.profiles.get(profileId) : undefined), [profileId]);
  const dayItems = useDayItems(profileId, isoDate);
  const { location: activeLocation, setActiveLocationId } = useActiveLocation(profileId);
  const locations = useLocations(profileId);
  const workingFor = useWorkingFor(profileId, activeLocation?.id ?? null);
  const rewardPhotoUrl = useMediaUrl(workingFor.reward?.photo_id);

  useMaterializedDay(profileId, isoDate);

  // Best-effort back-gesture trap: every back navigation just re-pushes the
  // same entry, so there is nowhere for "back" to go while hard-locked. Only
  // while hard-locked -- this is also the app's ordinary default view now
  // (lib/device/settings.ts's useParentMode), and a caregiver just looking
  // at their child's Today screen should still be able to back/exit the app
  // normally (BackButtonHandler falls through to CapApp.exitApp()).
  useEffect(() => {
    if (!locked_profile_id) return;
    window.history.pushState(null, '', window.location.href);
    function onPopState(): void {
      window.history.pushState(null, '', window.location.href);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [locked_profile_id]);

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
  // Tiles layout only: whether My Day (the list) is open instead of the tile home.
  const [showDay, setShowDay] = useState(false);
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

  // A stepped item's steps default open/closed per options.expand_steps
  // (Lock this device's "Show steps expanded"); this tracks only the ids
  // the child has explicitly toggled away from that default, rather than
  // seeding one Set per item up front, so a routine materializing later in
  // the day still gets the right default.
  const [toggledExpandIds, setToggledExpandIds] = useState<ReadonlySet<string>>(new Set());
  function isExpanded(itemId: string): boolean {
    return toggledExpandIds.has(itemId) ? !options.expand_steps : options.expand_steps;
  }
  function toggleExpanded(itemId: string): void {
    setToggledExpandIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

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
  function startStepTimer(minutes: number, emoji: string | null, photoId: string | null): void {
    setDuration(minutes * 60_000);
    setReveal(emoji || photoId ? { emoji: emoji ?? undefined, photo_id: photoId ?? undefined } : null);
    setLocked(true);
    start();
    setTimerOpen(true);
  }

  // SOW Q3, decided: a lock option lets the child pick their own location
  // from their header, big picture tiles, no text-only choices.
  // The child picking their own location (when the lock option allows it at
  // all) still needs the caregiver PIN to confirm -- unless no PIN is set
  // yet, in which case there's nothing to check against and this behaves
  // like it always did.
  function confirmLocationChange(locationId: string): void {
    const hash = user?.pin_hash;
    if (!hash) {
      setActiveLocationId(locationId);
      sheet.close();
      return;
    }
    const pinHash: string = hash;

    function handlePinComplete(pin: string): Promise<boolean> {
      return verifyPin(pin, pinHash).then((ok) => {
        if (!ok) return false;
        setActiveLocationId(locationId);
        sheet.close();
        return true;
      });
    }

    sheet.replace(<PinPad title="Caregiver PIN" onComplete={handlePinComplete} />, { title: 'Confirm location change' });
  }

  function openLocationPicker(): void {
    sheet.open(
      <ul className={styles.locationList}>
        {locations.map((loc) => (
          <li key={loc.id}>
            <button
              type="button"
              className={styles.locationTile}
              aria-label={loc.name}
              onClick={() => confirmLocationChange(loc.id)}
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
          tile={<Picture emoji={step.emoji} photo_id={step.photo_id} name={step.name} size="list" />}
          name={step.name}
          checked={node.done}
          onChange={(next) => void handleStepToggle(day, step.id, next)}
          durationMinutes={step.duration_minutes}
          depth={node.node.depth}
          onStartTimer={
            options.show_step_timers && step.duration_minutes
              ? () => startStepTimer(step.duration_minutes as number, step.emoji, step.photo_id)
              : undefined
          }
        />
        {node.children.length > 0 ? (
          <ul className={styles.steps}>{node.children.map((child) => renderStepNode(day, child))}</ul>
        ) : null}
      </li>
    );
  }

  function openFreeTime(): void {
    sheet.open(<FreeTimeSheet profileId={profileId} locationId={activeLocation?.id ?? null} canCreate={false} />, { title: 'Free time' });
  }

  function openFirstThen(): void {
    sheet.open(<FirstThenPanels profileId={profileId} mode="child" />, { title: 'First, then' });
  }

  function openChipperChart(): void {
    sheet.open(<ChipperChartSheet profileId={profileId} userId={userId} />, { title: 'Chipper Chart' });
  }

  function openApps(): void {
    sheet.open(<AllowedAppsSheet profileId={profileId} />, { title: 'Apps' });
  }

  function openWorkingFor(): void {
    sheet.open(<WorkingForSheet profileId={profileId} locationId={activeLocation?.id ?? null} />, { title: 'Chips' });
  }

  // Owner's doc EI 2, switchable in Settings > profile (default on).
  function openPickReward(): void {
    sheet.open(
      <PickRewardSheet profileId={profileId} locationId={activeLocation?.id ?? null} currentRewardId={workingFor.reward?.id ?? null} />,
      { title: 'Working for' },
    );
  }

  const allowedApps = profile?.settings.allowed_app_packages ?? [];
  // A redeemed screen-time reward counts too, so its app is reachable from here while its time lasts.
  const hasTimedApps = (profile?.settings.timed_app_allowances ?? []).some((a) => a.allowed_until > now());
  const showAllowedApps =
    Boolean(profile?.settings.child_mode_active) && (allowedApps.length > 0 || hasTimedApps) && Capacitor.getPlatform() === 'android';
  const showBottomBar = options.show_free_time || options.show_first_then || options.show_chipper_chart || showAllowedApps || running;
  const canPickReward = profile?.settings.child_picks_reward !== false;

  if (!profileId || !profile) return null;

  // "Phone is resting" (profile setting, or a remote Rest): nothing but this
  // calm page and the caregiver's way back in. Other apps are blocked
  // natively; the notification bar stays usable for Wi-Fi and data.
  if (profile.settings.resting) {
    return (
      <div className={[styles.screen, styles.resting].join(' ')}>
        <span className={styles.restingMoon} aria-hidden="true">
          🌙
        </span>
        <h1 className={styles.restingTitle}>Phone is resting</h1>
        <p className={styles.restingText}>Time for a break. Ask a grown-up when it can wake up.</p>
        <IconButton icon="lock" aria-label="Caregiver unlock" variant="solid" className={styles.lockButton} onClick={() => setUnlocking(true)} />
        {unlocking ? <UnlockOverlay onClose={() => setUnlocking(false)} /> : null}
      </div>
    );
  }

  // "Only show First-Then" lock option: the sole content, full page --
  // no task list, no other options underneath it (unlike show_first_then,
  // which just adds a button that opens the same panels as a sheet).
  if (options.first_then_only) {
    return (
      <div className={styles.screen}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <Picture emoji={profile.avatar_emoji} photo_id={profile.avatar_photo_id} name={profile.name} size="child" />
            <h1 className={styles.name}>{profile.name}</h1>
          </div>
          <IconButton
            icon="lock"
            aria-label="Caregiver unlock"
            variant="solid"
            className={styles.lockButton}
            onClick={() => setUnlocking(true)}
          />
        </header>
        <FirstThenPanels profileId={profileId} mode="child" />
        {unlocking ? <UnlockOverlay onClose={() => setUnlocking(false)} /> : null}
      </div>
    );
  }

  const header = (
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
      {workingFor.reward || workingFor.filled > 0 || (canPickReward && activeLocation) ? (
        <div className={styles.chipRow}>
          <ChipStrip
            size="lg"
            filled={workingFor.filled}
            total={workingFor.goal}
            reward={
              workingFor.reward
                ? { emoji: workingFor.reward.emoji ?? undefined, photo_id: workingFor.reward.photo_id, photoUrl: rewardPhotoUrl, name: workingFor.reward.name }
                : undefined
            }
            onTap={canPickReward ? openPickReward : openWorkingFor}
          />
        </div>
      ) : null}
      <IconButton
        icon="lock"
        aria-label="Caregiver unlock"
        variant="solid"
        className={styles.lockButton}
        onClick={() => setUnlocking(true)}
      />
    </header>
  );

  // Picture-tiles home (profile setting child_layout, the caregiver's choice):
  // the same tools as the list view's bottom bar, as big tiles, each shown
  // only when the lock options already allow it.
  if (profile.settings.child_layout === 'tiles' && !showDay) {
    const chipsTile = workingFor.reward || workingFor.filled > 0 || (canPickReward && activeLocation);
    return (
      <div className={styles.screen}>
        {header}
        <p className={styles.greeting}>Hi {profile.name}! What do you want to do?</p>
        <div className={styles.tiles}>
          <HomeTile emoji="📅" label="My Day" onClick={() => setShowDay(true)} />
          {chipsTile ? <HomeTile emoji="⭐" label="Chips" onClick={canPickReward ? openPickReward : openWorkingFor} /> : null}
          {options.show_free_time ? <HomeTile emoji="🎈" label="Free time" onClick={openFreeTime} /> : null}
          {options.show_first_then ? <HomeTile emoji="➡️" label="First, then" onClick={openFirstThen} /> : null}
          {options.show_chipper_chart ? <HomeTile emoji="😊" label="Chipper Chart" onClick={openChipperChart} /> : null}
          {showAllowedApps ? <HomeTile emoji="📱" label="Apps" onClick={openApps} /> : null}
          {running ? <HomeTile emoji="⏱️" label="Timer" onClick={() => setTimerOpen(true)} /> : null}
        </div>
        {timerOpen ? <TimerFullScreen onClose={() => setTimerOpen(false)} /> : null}
        {unlocking ? <UnlockOverlay onClose={() => setUnlocking(false)} /> : null}
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      {header}
      {profile.settings.child_layout === 'tiles' ? (
        <BigButton variant="secondary" icon="arrowLeft" onClick={() => setShowDay(false)}>
          Home
        </BigButton>
      ) : null}

      <DayBand profileId={profileId} isoDate={isoDate} itemCount={dayItems.length} workingFor={workingFor} />

      {dayItems.length === 0 ? (
        <p className={styles.emptyText}>Nothing planned for today</p>
      ) : (
        <div className={styles.list}>
          {dayItems.map((day) => {
            const dimmed = day.item.completed_at !== null;
            const hasSteps = day.steps.length > 0;
            const expanded = hasSteps && isExpanded(day.item.id);
            const topSteps = hasSteps ? stepTree(day.steps) : [];
            const stepsDone = topSteps.filter((node) => node.done).length;
            const picture = <Picture emoji={day.activity.emoji} photo_id={day.activity.photo_id} name={day.activity.name} size="child" />;
            const nameLabel = (
              <span className={[styles.rowName, dimmed ? styles.dimmed : ''].filter(Boolean).join(' ')}>{day.activity.name}</span>
            );
            return (
              <div key={day.item.id} className={styles.card}>
                <div className={styles.row}>
                  {hasSteps ? (
                    <button
                      type="button"
                      className={styles.rowTap}
                      aria-expanded={expanded}
                      onClick={() => toggleExpanded(day.item.id)}
                    >
                      {picture}
                      <span className={styles.rowText}>
                        {nameLabel}
                        {/* Progress shows even collapsed (the old beta's "0/3 steps done"); the chevron rides
                            on this line, not beside the name, so the name keeps the row's width. */}
                        <span className={styles.stepProgress}>
                          {stepsDone}/{topSteps.length} steps done
                          <Icon name="chevron" size={18} className={[styles.expandChevron, expanded ? styles.open : ''].filter(Boolean).join(' ')} />
                        </span>
                      </span>
                    </button>
                  ) : (
                    <>
                      {picture}
                      {nameLabel}
                    </>
                  )}
                  <CheckCircle
                    checked={dimmed}
                    name={day.activity.name}
                    size="lg"
                    // A stepped task's chip only comes from finishing every step
                    // (setStepCompleted's cascade), never a direct tap here --
                    // tapping it just opens the steps, same as tapping the bar.
                    onChange={hasSteps ? () => toggleExpanded(day.item.id) : (next) => void handleToggle(day, next)}
                  />
                </div>

                {day.item.story_id ? <ReadStoryButton storyId={day.item.story_id} /> : null}

                {expanded ? <ul className={styles.steps}>{topSteps.map((node) => renderStepNode(day, node))}</ul> : null}

                {/* After the steps, not between the task and them, so an open routine reads as one block. */}
                {hasSteps && options.show_visual_schedule ? (
                  <BigButton variant="secondary" icon="expand" onClick={() => setScheduleItemId(day.item.id)}>
                    Steps
                  </BigButton>
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

      <TomorrowBand profileId={profileId} isoDate={isoDate} />

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
              onClick={openFreeTime}
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
              onClick={openFirstThen}
            >
              First, then
            </BigButton>
          ) : null}
          {options.show_chipper_chart ? (
            <BigButton
              variant="secondary"
              onClick={openChipperChart}
            >
              <span className={styles.emojiGlyph} aria-hidden="true">
                😊
              </span>
              Chipper Chart
            </BigButton>
          ) : null}
          {showAllowedApps ? (
            <BigButton
              variant="secondary"
              icon="grid"
              onClick={openApps}
            >
              Apps
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

function HomeTile({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.tile} onClick={onClick}>
      <span className={styles.tileEmoji} aria-hidden="true">
        {emoji}
      </span>
      <span className={styles.tileLabel}>{label}</span>
    </button>
  );
}
