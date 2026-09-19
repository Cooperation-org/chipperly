'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, isWeekend, todayIso } from '@chipperly/shared/helpers/date';
import type { Activity } from '@chipperly/shared/schemas/activity';
import { useActiveProfile } from '@/lib/profile/active';
import { useSession } from '@/lib/auth/session';
import { VerifyBanner } from '@/components/auth/VerifyBanner';
import {
  addToDay,
  copyDay,
  materializeRecurringFresh,
  useMaterializedDay,
  removeFromDay,
  reorder,
  setCompleted,
  setStepCompleted,
  stepTree,
  useDayItems,
  type DayItem,
  type StepNode,
} from '@/lib/data/schedule';
import { useActiveLocation } from '@/lib/data/locations';
import { useWorkingFor } from '@/lib/data/chips';
import { Picker } from '@/components/picker/Picker';
import { Picture } from '@/components/media/Picture';
import { ListRow } from '@/components/ui/ListRow';
import { StepRow } from '@/components/ui/StepRow';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { IconButton } from '@/components/ui/IconButton';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { ChipStrip } from '@/components/ui/ChipStrip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Celebration } from '@/components/ui/Celebration';
import { useSheet } from '@/components/ui/Sheet';
import { toast } from '@/lib/toast';
import { DateNav } from './DateNav';
import { DayNote } from './DayNote';
import { ItemSheet } from './ItemSheet';
import { allDone, groupByPartOfDay, moveItem, secondaryText, weekdayName } from './todayModel';
import styles from './TodayScreen.module.css';

/** S6: the Today tab. */
export function TodayScreen() {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const { user } = useSession();
  const { open, close } = useSheet();
  const [isoDate, setIsoDate] = useState<string>(() => todayIso());

  const profileId = profile?.id ?? '';
  const userId = user?.id ?? '';

  const dayItems = useDayItems(profileId, isoDate);
  const { location } = useActiveLocation(profileId);
  const workingFor = useWorkingFor(profileId, location?.id ?? null);

  useMaterializedDay(profileId, isoDate);

  // Local render order, seeded from the live query and re-seeded whenever
  // its ids change — except mid-drag, where the drag owns the order until drop.
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const draggingRef = useRef<{ id: string; startY: number; startIndex: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const dayItemIdsKey = dayItems.map((d) => d.item.id).join(',');
  useEffect(() => {
    if (draggingRef.current) return;
    setOrderIds(dayItems.map((d) => d.item.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayItemIdsKey]);

  const byId = useMemo(() => new Map(dayItems.map((d) => [d.item.id, d])), [dayItems]);
  // Falls back to the live query's own order until the sync effect below has
  // run once, so a fresh mount never flashes the empty state first.
  const displayIds = orderIds.length > 0 ? orderIds : dayItems.map((d) => d.item.id);
  const orderedItems = useMemo(
    () => displayIds.map((id) => byId.get(id)).filter((d): d is DayItem => d !== undefined),
    [displayIds, byId],
  );
  const groups = useMemo(() => groupByPartOfDay(orderedItems), [orderedItems]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  function toggleExpanded(id: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Separate from expandedIds (which shows/hides an item's whole step list):
  // once steps show, level 1 is always visible and anything nested under a
  // level-1+ step (S36) stays collapsed until its own chevron is tapped.
  const [expandedStepIds, setExpandedStepIds] = useState<ReadonlySet<string>>(new Set());
  function toggleStepExpanded(stepId: string): void {
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  function renderStepNode(node: StepNode, itemId: string, depth: number): ReactNode {
    const step = node.node.step;
    const hasChildren = node.children.length > 0;
    const expanded = expandedStepIds.has(step.id);
    return (
      <li key={step.id}>
        <StepRow
          tile={<Picture emoji={step.emoji} photo_id={step.photo_id} name={step.name} size="list" />}
          name={step.name}
          checked={node.done}
          onChange={(next) => void setStepCompleted(itemId, step.id, next, userId)}
          durationMinutes={step.duration_minutes}
          depth={depth}
          hasChildren={hasChildren}
          expanded={expanded}
          onToggle={hasChildren ? () => toggleStepExpanded(step.id) : undefined}
        />
        {hasChildren && expanded ? (
          <ul className={styles.steps}>{node.children.map((child) => renderStepNode(child, itemId, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  const [celebrating, setCelebrating] = useState(false);
  const wasAllDoneRef = useRef(false);
  const isAllDone = allDone(orderedItems);
  useEffect(() => {
    if (isAllDone && !wasAllDoneRef.current) setCelebrating(true);
    wasAllDoneRef.current = isAllDone;
  }, [isAllDone]);

  function openPicker(): void {
    const title = `Add to ${weekdayName(isoDate)}`;
    open(
      <Picker
        kind="activity"
        profileId={profileId}
        title={title}
        onPick={(picked) => {
          // Picker's onPick type covers both kinds; kind="activity" here means it's always an Activity.
          const activity = picked as Activity;
          void (async () => {
            const id = await addToDay(profileId, isoDate, activity.id);
            close();
            toast(`Added ${activity.name}`, {
              undo: () => {
                void removeFromDay(id, 'today');
              },
            });
          })();
        }}
        onCreateNew={() => {
          close();
          router.push(`/activity/edit/?add_to=${isoDate}`);
        }}
        onCreateRoutine={() => {
          close();
          router.push(`/activity/edit/?add_to=${isoDate}&routine=1`);
        }}
      />,
      { title },
    );
  }

  function openItem(day: DayItem): void {
    open(<ItemSheet day={day} userId={userId} />);
  }

  async function onToggleComplete(day: DayItem, next: boolean): Promise<void> {
    await setCompleted(day.item.id, next, userId);
    if (next) {
      toast(`Done: ${day.activity.name}`, {
        undo: () => {
          void setCompleted(day.item.id, false, userId);
        },
      });
    }
  }

  function commitReorder(next: string[], changed: boolean): void {
    setOrderIds(next);
    if (changed && profileId) void reorder(profileId, isoDate, next);
  }

  function moveByKeyboard(id: string, direction: -1 | 1): void {
    const from = displayIds.indexOf(id);
    if (from < 0) return;
    const to = from + direction;
    if (to < 0 || to >= displayIds.length) return;
    commitReorder(moveItem(displayIds, from, to), true);
  }

  function onHandlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, id: string): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = { id, startY: e.clientY, startIndex: displayIds.indexOf(id) };
    setDraggingId(id);
    setDragOffset(0);
  }

  function onHandlePointerMove(e: ReactPointerEvent<HTMLButtonElement>): void {
    if (!draggingRef.current) return;
    setDragOffset(e.clientY - draggingRef.current.startY);
  }

  // ponytail: measures actual row positions at drop time rather than assuming
  // a fixed row height, so expanded/steps rows still land correctly.
  function onHandlePointerUp(e: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = draggingRef.current;
    draggingRef.current = null;
    setDraggingId(null);
    setDragOffset(0);
    if (!drag) return;

    let targetIndex = drag.startIndex;
    let best = Infinity;
    displayIds.forEach((id, idx) => {
      const el = rowRefs.current.get(id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - e.clientY);
      if (dist < best) {
        best = dist;
        targetIndex = idx;
      }
    });
    commitReorder(moveItem(displayIds, drag.startIndex, targetIndex), targetIndex !== drag.startIndex);
  }

  if (!profile) return null;

  return (
    <div className={styles.screen}>
      <VerifyBanner />
      <DateNav isoDate={isoDate} onChange={setIsoDate} />
      <DayNote profileId={profileId} isoDate={isoDate} childName={profile.name} />

      <div className={styles.chipStripRow}>
        {workingFor.reward || workingFor.filled > 0 ? (
          <ChipStrip
            filled={workingFor.filled}
            total={workingFor.goal}
            reward={
              workingFor.reward
                ? {
                    emoji: workingFor.reward.emoji ?? undefined,
                    photo_id: workingFor.reward.photo_id,
                    name: workingFor.reward.name,
                  }
                : undefined
            }
            onTap={() => router.push('/chips/')}
          />
        ) : null}
        <button
          type="button"
          className={styles.chipperChartButton}
          aria-label="Chipper Chart"
          onClick={() => router.push('/chipper-chart/')}
        >
          <span aria-hidden="true">😊</span>
        </button>
      </div>

      {orderedItems.length === 0 ? (
        <EmptyState
          picture={
            <span className={styles.emptyEmoji} aria-hidden="true">
              🗓️
            </span>
          }
          sentence={`Nothing planned for ${weekdayName(isoDate)}`}
          actions={[
            <Button key="add" onClick={openPicker}>
              Add activity
            </Button>,
            <Button
              key="copy"
              variant="secondary"
              onClick={() => {
                void copyDay(profileId, addDays(isoDate, -1), isoDate);
              }}
            >
              Copy yesterday
            </Button>,
            <Button
              key="plan"
              variant="secondary"
              onClick={() => {
                void materializeRecurringFresh(profileId, isoDate);
              }}
            >
              {isWeekend(isoDate) ? 'Use weekend plan' : 'Use weekday plan'}
            </Button>,
          ]}
        />
      ) : (
        <div className={styles.list}>
          {groups.map((group, gi) => (
            <section key={group.header ?? `g${gi}`} className={styles.group}>
              {group.header ? <h3 className={styles.groupHeader}>{group.header}</h3> : null}
              {group.items.map((day) => {
                const expanded = expandedIds.has(day.item.id);
                const dimmed = day.item.completed_at !== null;
                const isDragging = draggingId === day.item.id;
                return (
                  <div
                    key={day.item.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(day.item.id, el);
                      else rowRefs.current.delete(day.item.id);
                    }}
                    className={[styles.itemBlock, isDragging ? styles.dragging : ''].filter(Boolean).join(' ')}
                    style={isDragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
                  >
                    <ListRow
                      handle={
                        <button
                          type="button"
                          className={styles.dragHandle}
                          aria-label={`Move ${day.activity.name}`}
                          onPointerDown={(e) => onHandlePointerDown(e, day.item.id)}
                          onPointerMove={onHandlePointerMove}
                          onPointerUp={onHandlePointerUp}
                          onPointerCancel={onHandlePointerUp}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              moveByKeyboard(day.item.id, -1);
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              moveByKeyboard(day.item.id, 1);
                            }
                          }}
                        >
                          <Icon name="drag" size={20} />
                        </button>
                      }
                      tile={
                        <Picture emoji={day.activity.emoji} photo_id={day.activity.photo_id} name={day.activity.name} size="list" />
                      }
                      name={day.activity.name}
                      secondary={
                        day.item.story_id ? (
                          <span className={styles.secondaryWithStory}>
                            {secondaryText(day)}
                            <Icon name="book" size={16} title="Has a story" />
                          </span>
                        ) : (
                          secondaryText(day)
                        )
                      }
                      dimmed={dimmed}
                      onTap={() => openItem(day)}
                      trailing={
                        <div className={styles.trailingGroup}>
                          {day.steps.length > 0 ? (
                            <IconButton
                              icon="chevron"
                              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${day.activity.name} steps`}
                              aria-expanded={expanded}
                              className={expanded ? styles.chevronOpen : undefined}
                              onClick={() => toggleExpanded(day.item.id)}
                            />
                          ) : null}
                          <CheckCircle checked={dimmed} name={day.activity.name} onChange={(next) => void onToggleComplete(day, next)} />
                        </div>
                      }
                    />
                    {expanded && day.steps.length > 0 ? (
                      <ul className={styles.steps}>{stepTree(day.steps).map((node) => renderStepNode(node, day.item.id, 0))}</ul>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ))}
          {isAllDone ? <p className={styles.allDone}>All done for today</p> : null}
        </div>
      )}

      {celebrating ? (
        <div className={styles.celebrationWrap}>
          <Celebration kind="all_done" onDone={() => setCelebrating(false)} />
        </div>
      ) : null}

      <div className={styles.addButtonWrap}>
        <IconButton icon="plus" aria-label="Add activity" variant="solid" size={28} className={styles.addButton} onClick={openPicker} />
      </div>
    </div>
  );
}
