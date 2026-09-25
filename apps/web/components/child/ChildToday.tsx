'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import { todayIso } from '@chipperly/shared/helpers/date';
import { exitParentMode, useLock } from '@/lib/device/settings';
import { useSession } from '@/lib/auth/session';
import { useActiveProfile } from '@/lib/profile/active';
import { childViewProfileId, useDeviceRole } from '@/lib/device/role';
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
import { levelEmoji, useMoodLevel } from '@/lib/data/mood';
import { sendRewardRequest } from '@/lib/data/rewardRequest';
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
import { groupByPartOfDay } from '@/components/schedule/todayModel';
import { ChipperChartSheet } from '@/components/chipperChart/ChipperChartSheet';
import { VisualSchedule } from '@/components/schedule/VisualSchedule';
import { AttitudePrompt } from './AttitudePrompt';
import { ChildCheckupSheet, MomentSheet } from '@/components/feelings/FeelingSheets';
import { ChildOrderSheet } from './ChildOrderSheet';
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
  const { profile: activeProfile, profiles: allProfiles } = useActiveProfile();
  const deviceRole = useDeviceRole();
  const sheet = useSheet();
  // Selector hook, not useTimer(): the full TimerState changes ~60x/sec while
  // a timer runs, and re-executing this whole screen's body on every tick
  // (dayItems.map, chip strip, header) is the P1 this avoids. The one thing
  // that needs the live remaining_ms is isolated in TimerRemaining below.
  const running = useTimerRunning();

  const profileId = childViewProfileId(locked_profile_id, deviceRole, activeProfile, allProfiles);
  const userId = user?.id ?? '';
  const [isoDate] = useState(() => todayIso());

  const profile = useLiveQuery(() => (profileId ? db.profiles.get(profileId) : undefined), [profileId]);
  // Same order as the caregiver's Today (groupByPartOfDay): untimed first, then morning/afternoon/evening.
  // Raw position order dropped anything added later, like a new routine, to the bottom of the child's day.
  const rawDayItems = useDayItems(profileId, isoDate);
  // A child who may set their own order sees exactly that order (position), not the part-of-day grouping.
  const ownOrder = profile?.settings.child_reorders === true;
  const dayItems = useMemo(
    () => (ownOrder ? rawDayItems : groupByPartOfDay(rawDayItems).flatMap((group) => group.items)),
    [rawDayItems, ownOrder],
  );
  const { location: activeLocation, setActiveLocationId } = useActiveLocation(profileId);
  const locations = useLocations(profileId);
  const workingFor = useWorkingFor(profileId, activeLocation?.id ?? null);
  const rewardPhotoUrl = useMediaUrl(workingFor.reward?.photo_id);

  useMaterializedDay(profileId, isoDate);
  // The Chipper Chart button shows today's face, so it changes as the chart does.
  const moodLevel = useMoodLevel(profileId, isoDate);

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

  // A locked device never stays in caregiver mode behind the child view
  // (lockToChild navigates here first, then this switches it off), so the
  // caregiver screens still need the PIN.
  useEffect(() => {
    if (locked_profile_id) void exitParentMode();
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

  // The bottom bar wraps to a second row on narrow screens; publish its real
  // height (tokens.css --bottom-bar-h) so the list's bottom padding and the
  // toast host clear it, instead of assuming one row.
  const barObserver = useRef<ResizeObserver | null>(null);
  const bottomBarRef = useCallback((bar: HTMLDivElement | null) => {
    const root = document.documentElement;
    barObserver.current?.disconnect();
    barObserver.current = null;
    if (!bar) {
      root.style.removeProperty('--bottom-bar-h');
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    barObserver.current = new ResizeObserver(() => root.style.setProperty('--bottom-bar-h', `${bar.offsetHeight}px`));
    barObserver.current.observe(bar);
  }, []);
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

  // Finishing something can earn a reward three ways; each one alerts the caregivers: the chip that fills
  // the board for the reward being worked for, the routine's own goal reward, and the day's goal reward
  // once this was the last thing left today.
  async function alertRewardsFor(day: DayItem): Promise<void> {
    const locationId = activeLocation?.id ?? null;
    const { reward, goal, filled } = workingFor;
    const chips = day.activity.chip_value;
    if (reward && chips > 0 && filled < goal && filled + chips >= goal) void sendRewardRequest(profileId, locationId, reward.name, 'chips');

    const routineReward = day.activity.goal_reward_id ? await db.rewards.get(day.activity.goal_reward_id) : undefined;
    if (routineReward) void sendRewardRequest(profileId, locationId, routineReward.name, 'routine', day.activity.name);

    const dayRewardId = profile?.settings.day_goal_reward_id;
    const lastOne = dayItems.every((d) => d.item.id === day.item.id || d.item.completed_at !== null);
    const dayReward = dayRewardId && lastOne ? await db.rewards.get(dayRewardId) : undefined;
    if (dayReward) void sendRewardRequest(profileId, locationId, dayReward.name, 'day_goal');
  }

  async function handleToggle(day: DayItem, next: boolean): Promise<void> {
    await setCompleted(day.item.id, next, userId);
    if (!next) return;
    void alertRewardsFor(day);
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
    void alertRewardsFor(day);
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

    sheet.replace(<PinPad title="Team PIN" onComplete={handlePinComplete} />, { title: 'Confirm location change' });
  }

  function openMoment(): void {
    sheet.open(<MomentSheet profileId={profileId} />, { title: 'How do I feel?' });
  }

  function openOrder(): void {
    sheet.open(<ChildOrderSheet profileId={profileId} isoDate={isoDate} dayItems={dayItems} />, { title: 'My order' });
  }

  function openCheckup(): void {
    sheet.open(<ChildCheckupSheet profileId={profileId} dayItems={dayItems} />, { title: 'Check-up' });
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
  // Sub-steps start closed; tapping their parent step opens them (its star still ticks it all).
  const [openStepIds, setOpenStepIds] = useState<ReadonlySet<string>>(new Set());
  function toggleStepOpen(stepId: string): void {
    setOpenStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  function renderStepNode(day: DayItem, node: StepNode): ReactNode {
    const step = node.node.step;
    const hasChildren = node.children.length > 0;
    const open = openStepIds.has(step.id);
    return (
      <li key={step.id}>
        <StepRow
          hasChildren={hasChildren}
          expanded={open}
          onToggle={hasChildren ? () => toggleStepOpen(step.id) : undefined}
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
        {hasChildren && open ? (
          <ul className={styles.steps}>{node.children.map((child) => renderStepNode(day, child))}</ul>
        ) : null}
      </li>
    );
  }

  function openFreeTime(): void {
    sheet.open(<FreeTimeSheet profileId={profileId} locationId={activeLocation?.id ?? null} canCreate={false} />, { title: 'Free time' });
  }

  function openFirstThen(): void {
    sheet.open(
      <FirstThenPanels
        profileId={profileId}
        mode="child"
        onStartTimer={(minutes, emoji, photoId) => {
          sheet.close();
          startStepTimer(minutes, emoji, photoId);
        }}
      />,
      { title: 'First, then' },
    );
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
  const showBottomBar = options.show_free_time || options.show_first_then || showAllowedApps || running;
  const canPickReward = profile?.settings.child_picks_reward !== false;
  const showChipStrip = Boolean(workingFor.reward || workingFor.filled > 0 || (canPickReward && activeLocation));

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
        <IconButton icon="lock" aria-label="Team unlock" variant="solid" className={styles.lockButton} onClick={() => setUnlocking(true)} />
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
            aria-label="Team unlock"
            variant="solid"
            className={styles.lockButton}
            onClick={() => setUnlocking(true)}
          />
        </header>
        <FirstThenPanels profileId={profileId} mode="child" onStartTimer={startStepTimer} />
        {timerOpen ? <TimerFullScreen onClose={() => setTimerOpen(false)} /> : null}
        {unlocking ? <UnlockOverlay onClose={() => setUnlocking(false)} /> : null}
      </div>
    );
  }

  // Big pictures, fewer words (profile setting, the team's choice): see .pictureMode in the CSS.
  const screenClass = [styles.screen, profile.settings.picture_mode ? styles.pictureMode : ''].filter(Boolean).join(' ');

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
      {/* Always shown: the "How do I feel?" face lives here with the chips. */}
      <div className={styles.chipRow}>
        {showChipStrip ? (
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
        ) : null}
        {/* Up here with the chips, like the caregiver's Today, not in the bottom bar. */}
        {options.show_chipper_chart ? (
          <button type="button" className={styles.chipperChartButton} aria-label="Chipper Chart" onClick={openChipperChart}>
            <span aria-hidden="true">{levelEmoji(moodLevel)}</span>
          </button>
        ) : null}
        <button type="button" className={styles.chipperChartButton} aria-label="How do I feel?" onClick={openMoment}>
          <span aria-hidden="true">💭</span>
        </button>
      </div>
      <IconButton
        icon="lock"
        aria-label="Team unlock"
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
      <div className={screenClass}>
        {header}
        <p className={styles.greeting}>Hi {profile.name}! What do you want to do?</p>
        <div className={styles.tiles}>
          <HomeTile emoji="📅" label="My Day" onClick={() => setShowDay(true)} />
          {chipsTile ? <HomeTile emoji="⭐" label="Chips" onClick={canPickReward ? openPickReward : openWorkingFor} /> : null}
          {options.show_free_time ? <HomeTile emoji="🎈" label="Free time" onClick={openFreeTime} /> : null}
          {options.show_first_then ? <HomeTile emoji="➡️" label="First, then" onClick={openFirstThen} /> : null}
          {showAllowedApps ? <HomeTile emoji="📱" label="Apps" onClick={openApps} /> : null}
          {running ? <HomeTile emoji="⏱️" label="Timer" onClick={() => setTimerOpen(true)} /> : null}
        </div>
        {timerOpen ? <TimerFullScreen onClose={() => setTimerOpen(false)} /> : null}
        {unlocking ? <UnlockOverlay onClose={() => setUnlocking(false)} /> : null}
      </div>
    );
  }

  return (
    <div className={screenClass}>
      {header}
      {profile.settings.child_layout === 'tiles' ? (
        <BigButton variant="secondary" icon="arrowLeft" onClick={() => setShowDay(false)}>
          Home
        </BigButton>
      ) : null}

      <DayBand profileId={profileId} isoDate={isoDate} itemCount={dayItems.length} />

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
                    // Each finished step lights its share of the 12-ray star (6 steps: 2 rays each).
                    progress={hasSteps ? stepsDone / topSteps.length : undefined}
                    // A stepped task's chip normally comes from finishing every step
                    // (setStepCompleted's cascade), so tapping here opens the steps.
                    // With the whole-routine bonus on and no step ticked yet, the
                    // child may finish it in one go instead (setCompleted awards the bonus).
                    onChange={
                      !hasSteps || (profile.settings.routine_bonus_chips && stepsDone === 0 && !dimmed)
                        ? (next) => void handleToggle(day, next)
                        : () => toggleExpanded(day.item.id)
                    }
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

          {profile.settings.child_reorders && dayItems.length > 1 ? (
            <BigButton variant="secondary" icon="split" onClick={openOrder}>
              Change my order
            </BigButton>
          ) : null}

          {/* The day's last thing, but not a task: nothing to tick, nothing earned. */}
          <BigButton variant={isAllDone ? 'primary' : 'secondary'} onClick={openCheckup}>
            <span className={styles.emojiGlyph} aria-hidden="true">
              🌙
            </span>
            Check-up
          </BigButton>
        </div>
      )}

      <TomorrowBand profileId={profileId} isoDate={isoDate} />

      {celebrating ? (
        <div className={styles.celebrationWrap}>
          <Celebration kind="all_done" onDone={() => setCelebrating(false)} />
        </div>
      ) : null}

      {showBottomBar ? (
        <div className={styles.bottomBar} ref={bottomBarRef}>
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
