'use client';

import localFont from 'next/font/local';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { springEasing } from '../lib/spring';
import { ChipStar } from './ChipStar';
import s from './HeroDemo.module.css';

// Same emoji font as the app (Twemoji subset, CC-BY 4.0), so the demo
// matches the screenshots on every OS.
const twemoji = localFont({ src: '../app/fonts/twemoji-chipperly.woff2', variable: '--emoji', display: 'swap', adjustFontFallback: false });

type Step = { id: string; emoji: string; label: string };
type Task = { id: string; emoji: string; label: string; time: string; steps?: Step[] };

const MORNING: Task[] = [
  { id: 'wake', emoji: '🛏', label: 'Wake up', time: '7:00' },
  { id: 'teeth', emoji: '🪥', label: 'Brush teeth', time: '7:10' },
  {
    id: 'dress',
    emoji: '👕',
    label: 'Get dressed',
    time: '7:20',
    steps: [
      { id: 'shirt', emoji: '👕', label: 'Put on shirt' },
      { id: 'pants', emoji: '👖', label: 'Put on pants' },
      { id: 'socks', emoji: '🧦', label: 'Put on socks' },
    ],
  },
  { id: 'eat', emoji: '🍎', label: 'Breakfast', time: '7:30' },
  { id: 'shoes', emoji: '👟', label: 'Shoes on', time: '7:50' },
];
const GOAL = MORNING.length;
const TIMER_S = 60;
const SPRING = springEasing();

type Tab = 'today' | 'timer' | 'ft';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The app's check: an empty circle that becomes the Chipperly star with a tick; steps light its rays first. */
function Check({ checked, progress = 0, small }: { checked: boolean; progress?: number; small?: boolean }) {
  const rays = !checked && progress > 0 ? Math.min(11, Math.round(progress * 12)) : undefined;
  return (
    <span className={`${s.check} ${small ? s.checkSm : ''} ${checked ? s.checked : ''} ${rays ? s.partial : ''}`} aria-hidden="true">
      <ChipStar size="100%" rays={rays} className={s.checkStar} />
      <svg viewBox="0 0 24 24" className={s.tick}>
        <path d="M5 13l5 5 9-11" />
      </svg>
    </span>
  );
}

export function HeroDemo({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  const [tab, setTab] = useState<Tab>('today');
  const [done, setDone] = useState<Set<string>>(new Set()); // task ids and step ids
  const [open, setOpen] = useState(false); // Get dressed steps expanded
  const [chips, setChips] = useState(0);
  const [redeemed, setRedeemed] = useState(false);
  const [announce, setAnnounce] = useState('');
  const earned = useRef(new Set<string>());
  const pending = useRef(0); // chips in flight, so fast taps target the right slot
  const slots = useRef<(HTMLSpanElement | null)[]>([]);

  // Timer
  const [remaining, setRemaining] = useState(TIMER_S);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);

  // First, then
  const [firstDone, setFirstDone] = useState(false);
  const [asked, setAsked] = useState(false);
  const [notice, setNotice] = useState(false);

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    const apply = () => flushSync(() => setTab(next));
    if (!reducedMotion() && 'startViewTransition' in document) document.startViewTransition(apply);
    else apply();
  };

  const landChip = useCallback((slot: number) => {
    setChips((c) => Math.max(c, slot + 1));
    const el = slots.current[slot];
    if (el && !reducedMotion()) {
      el.animate([{ transform: 'scale(0.4) rotate(-40deg)' }, { transform: 'scale(1) rotate(0deg)' }], { duration: SPRING.duration, easing: SPRING.easing });
    }
    setAnnounce(`Chip earned. ${slot + 1} of ${GOAL}.`);
  }, []);

  // A task was just finished: fly a Chipperly star from its check to the next slot.
  const earnChip = (taskId: string, from: HTMLElement | null) => {
    if (earned.current.has(taskId) || redeemed) return;
    earned.current.add(taskId);
    const slot = chips + pending.current;
    if (slot >= GOAL) return;
    const target = slots.current[slot];
    const source = from?.querySelector('[data-chipstar]');
    if (!target || !from || !source || reducedMotion()) return landChip(slot);

    pending.current += 1;
    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const star = document.createElement('span');
    star.className = s.flyer;
    const svg = source.cloneNode(true) as SVGElement;
    svg.querySelectorAll('path').forEach((p, i) => {
      p.setAttribute('fill', ['#df5a20', '#f89c10', '#df5a20', '#b5d222', '#fddf1e', '#f89c10', '#df5a20', '#f89c10', '#fddf1e', '#b5d222', '#24a6e1', '#815e98'][i]);
      p.setAttribute('opacity', '1');
    });
    svg.querySelector('circle')?.setAttribute('fill', '#13b6a5');
    star.appendChild(svg);
    star.style.left = `${a.left + a.width / 2}px`;
    star.style.top = `${a.top + a.height / 2}px`;
    document.body.appendChild(star);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const lift = Math.min(60, Math.abs(dy) * 0.35 + 24);
    star
      .animate(
        [
          { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)' },
          { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.45 - lift}px)) scale(1.2) rotate(120deg)`, offset: 0.5 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8) rotate(180deg)` },
        ],
        { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
      .finished.finally(() => {
        star.remove();
        pending.current -= 1;
        landChip(slot);
      });
  };

  const toggleTask = (task: Task, row: HTMLElement) => {
    const next = new Set(done);
    if (next.has(task.id)) {
      next.delete(task.id); // a chip once earned stays: rewards are never taken away
      setDone(next);
      return;
    }
    next.add(task.id);
    task.steps?.forEach((st) => next.add(st.id));
    setDone(next);
    earnChip(task.id, row.querySelector(`.${s.check}`));
  };

  const toggleStep = (task: Task, step: Step, taskRow: HTMLElement | null) => {
    const next = new Set(done);
    if (next.has(step.id)) next.delete(step.id);
    else next.add(step.id);
    const all = task.steps!.every((st) => next.has(st.id));
    const count = task.steps!.filter((st) => next.has(st.id)).length;
    if (all) next.add(task.id);
    else next.delete(task.id);
    setDone(next);
    setAnnounce(all ? `${task.label} done.` : `${count} of ${task.steps!.length} steps done.`);
    if (all) earnChip(task.id, taskRow?.querySelector(`.${s.check}`) ?? null);
  };

  const redeem = () => {
    setRedeemed(true);
    setAnnounce('Screen time redeemed. All done!');
  };

  const ask = () => {
    setAsked(true);
    setNotice(true);
    setAnnounce('Asked for play time. A grown-up was notified.');
  };

  // The notification banner leaves on its own after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(false), 3600);
    return () => clearTimeout(t);
  }, [notice]);

  const reset = () => {
    earned.current.clear();
    setDone(new Set());
    setOpen(false);
    setChips(0);
    setRedeemed(false);
    setRunning(false);
    setRemaining(TIMER_S);
    setFirstDone(false);
    setAsked(false);
    setNotice(false);
    setAnnounce('Demo reset.');
  };

  // Timer: one rAF loop while running, drawn from wall-clock time so it
  // stays right even if frames are dropped or the tab is backgrounded.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, (endAt.current - performance.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        setAnnounce('Timer done. All done!');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const startPause = () => {
    if (running) return setRunning(false);
    const from = remaining <= 0 ? TIMER_S : remaining;
    setRemaining(from);
    endAt.current = performance.now() + from * 1000;
    setRunning(true);
  };

  const full = chips >= GOAL;
  const secs = Math.ceil(remaining);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <div className={`${s.demo} ${twemoji.variable}`}>
      <p className={s.hint} aria-hidden="true">
        <span className={s.hintDot} /> Try it: tap Benny&rsquo;s morning
      </p>
      <div className={s.phone} role="group" aria-label="Interactive Chipperly demo. Nothing is saved.">
        <div className={s.screen}>
          {notice && (
            <div className={s.notice} role="presentation">
              <span className={s.noticeIcon} aria-hidden="true">
                <ChipStar size={22} />
              </span>
              <span className={s.noticeText}>
                <strong>Benny is asking for Play time</strong>
                <span>Chipperly · caregiver notified</span>
              </span>
              <span aria-hidden="true">🔔</span>
            </div>
          )}

          <header className={s.top}>
            <span className={s.avatar} aria-hidden="true">
              🦁
            </span>
            <strong>Benny</strong>
            <button type="button" className={s.reset} onClick={reset}>
              Reset
            </button>
          </header>

          <div className={s.board} aria-label={`${chips} of ${GOAL} chips, working for Screen time`}>
            <div className={s.slots} aria-hidden="true">
              {Array.from({ length: GOAL }, (_, i) => (
                <span key={i} ref={(el) => void (slots.current[i] = el)} className={s.slot}>
                  <ChipStar size="100%" muted={!(i < chips && !redeemed)} />
                </span>
              ))}
            </div>
            {full && !redeemed ? (
              <button type="button" className={s.redeem} onClick={redeem}>
                Redeem <span aria-hidden="true">📱</span>
              </button>
            ) : (
              <div className={s.working}>
                <span className={s.small}>Working for</span>
                <span>
                  <span aria-hidden="true">📱</span> Screen time
                </span>
              </div>
            )}
          </div>

          <div className={s.body} style={{ viewTransitionName: 'demo-body' }}>
            {tab === 'today' &&
              (redeemed ? (
                <div className={s.celebrate}>
                  <ChipStar size={72} className={s.celebrateStar} />
                  <p className={s.allDone}>All done!</p>
                  <p className={s.small}>Benny earned his screen time.</p>
                  <a className={s.cta} href={ctaHref}>
                    {ctaLabel}
                  </a>
                  <button type="button" className={s.linkBtn} onClick={reset}>
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <p className={s.section}>Morning</p>
                  <ul className={s.list}>
                    {MORNING.map((m) => {
                      const on = done.has(m.id);
                      if (!m.steps) {
                        return (
                          <li key={m.id}>
                            <button type="button" className={`${s.item} ${on ? s.itemDone : ''}`} aria-pressed={on} onClick={(e) => toggleTask(m, e.currentTarget)}>
                              <span className={s.tile} aria-hidden="true">
                                {m.emoji}
                              </span>
                              <span className={s.label}>
                                {m.label}
                                <span className={s.time}>{m.time} AM</span>
                              </span>
                              <Check checked={on} />
                            </button>
                          </li>
                        );
                      }
                      const stepsDone = m.steps.filter((st) => done.has(st.id)).length;
                      return (
                        <li key={m.id} className={`${s.routine} ${on ? s.itemDone : ''}`} id="demo-dress">
                          <div className={s.routineRow}>
                            <button type="button" className={s.expand} aria-expanded={open} aria-controls="demo-steps" onClick={() => setOpen((v) => !v)}>
                              <span className={s.tile} aria-hidden="true">
                                {m.emoji}
                              </span>
                              <span className={s.label}>
                                {m.label}
                                <span className={s.time}>
                                  {stepsDone}/{m.steps.length} steps done
                                  <svg viewBox="0 0 24 24" className={`${s.chev} ${open ? s.chevOpen : ''}`} aria-hidden="true">
                                    <path d="M6 9l6 6 6-6" />
                                  </svg>
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              className={s.checkBtn}
                              aria-pressed={on}
                              aria-label={`${m.label}, ${on ? 'done' : 'not done'}`}
                              onClick={(e) => toggleTask(m, e.currentTarget)}
                            >
                              <Check checked={on} progress={stepsDone / m.steps.length} />
                            </button>
                          </div>
                          <div className={`${s.steps} ${open ? s.stepsOpen : ''}`} id="demo-steps">
                            <ul>
                              {m.steps.map((st) => {
                                const stOn = done.has(st.id);
                                return (
                                  <li key={st.id}>
                                    <button
                                      type="button"
                                      className={`${s.step} ${stOn ? s.itemDone : ''}`}
                                      aria-pressed={stOn}
                                      tabIndex={open ? 0 : -1}
                                      onClick={() => toggleStep(m, st, document.getElementById('demo-dress'))}
                                    >
                                      <span className={s.tileSm} aria-hidden="true">
                                        {st.emoji}
                                      </span>
                                      <span className={s.label}>{st.label}</span>
                                      <Check checked={stOn} small />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ))}

            {tab === 'timer' && (
              <div className={s.timer}>
                <svg viewBox="0 0 128 128" className={s.ring} aria-hidden="true">
                  <circle cx="64" cy="64" r={R} className={s.ringTrack} />
                  <circle cx="64" cy="64" r={R} className={s.ringFill} strokeDasharray={C} strokeDashoffset={C * (1 - remaining / TIMER_S)} />
                </svg>
                <p className={s.clock} aria-live="off">
                  {remaining <= 0 ? 'All done!' : clock}
                </p>
                <div className={s.row}>
                  <button type="button" className={s.cta} onClick={startPause}>
                    {running ? 'Pause' : remaining <= 0 ? 'Again' : remaining < TIMER_S ? 'Resume' : 'Start 1 min'}
                  </button>
                  {remaining < TIMER_S && !running && (
                    <button type="button" className={s.linkBtn} onClick={() => setRemaining(TIMER_S)}>
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === 'ft' && (
              <div className={s.ft}>
                <button
                  type="button"
                  className={`${s.ftCard} ${firstDone ? s.ftDone : ''}`}
                  aria-pressed={firstDone}
                  onClick={() => {
                    setFirstDone((v) => !v);
                    if (firstDone) setAsked(false);
                    setAnnounce(firstDone ? 'Bath time not done.' : 'Bath time done. Tap Play time to ask for it.');
                  }}
                >
                  <span className={s.small}>First</span>
                  <span className={s.bigEmoji} aria-hidden="true">
                    🛁
                  </span>
                  <span>Bath time</span>
                  <span className={s.ftCheck}>
                    <Check checked={firstDone} />
                  </span>
                </button>
                <button type="button" className={`${s.ftCard} ${firstDone ? s.ftNow : ''}`} disabled={!firstDone || asked} onClick={ask} aria-label={firstDone && !asked ? 'Then: Play time. Tap to ask for it.' : undefined}>
                  <span className={s.small}>Then</span>
                  <span className={s.bigEmoji} aria-hidden="true">
                    🧸
                  </span>
                  <span>Play time</span>
                  {firstDone && <span className={s.ftHint}>{asked ? 'Asked. A grown-up is on the way.' : 'Tap to ask for it'}</span>}
                </button>
              </div>
            )}
          </div>

          <nav className={s.tabs} aria-label="Demo tools">
            {(
              [
                ['today', 'Today', 'M5 5h14v15H5zM5 9h14M9 3v4M15 3v4'],
                ['timer', 'Timer', 'M12 8v5l3 2M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9 2h6'],
                ['ft', 'First–Then', 'M4 6h6v12H4zM14 6h6v12h-6z'],
              ] as const
            ).map(([id, label, d]) => (
              <button key={id} type="button" className={`${s.tab} ${tab === id ? s.tabOn : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => switchTab(id)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={d} />
                </svg>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
