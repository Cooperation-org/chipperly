'use client';

import localFont from 'next/font/local';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { springEasing } from '../lib/spring';
import s from './HeroDemo.module.css';

// Same emoji font as the app (Twemoji subset, CC-BY 4.0), so the demo
// matches the screenshots on every OS.
const twemoji = localFont({ src: '../app/fonts/twemoji-chipperly.woff2', variable: '--emoji', display: 'swap', adjustFontFallback: false });

const MORNING = [
  { id: 'wake', emoji: '🛏', label: 'Wake up', time: '7:00' },
  { id: 'teeth', emoji: '🪥', label: 'Brush teeth', time: '7:10' },
  { id: 'dress', emoji: '👕', label: 'Get dressed', time: '7:20' },
  { id: 'eat', emoji: '🍎', label: 'Breakfast', time: '7:30' },
  { id: 'shoes', emoji: '👟', label: 'Shoes on', time: '7:50' },
];
const GOAL = MORNING.length;
const TIMER_S = 60;
const SPRING = springEasing();

type Tab = 'today' | 'timer' | 'ft';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function HeroDemo({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  const [tab, setTab] = useState<Tab>('today');
  const [done, setDone] = useState<Set<string>>(new Set());
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
      el.animate([{ transform: 'scale(0.4)' }, { transform: 'scale(1)' }], { duration: SPRING.duration, easing: SPRING.easing });
    }
    setAnnounce(`Chip earned. ${slot + 1} of ${GOAL}.`);
  }, []);

  const toggle = (id: string, from: HTMLElement) => {
    const next = new Set(done);
    if (next.has(id)) {
      next.delete(id); // a chip once earned stays: rewards are never taken away
      setDone(next);
      return;
    }
    next.add(id);
    setDone(next);
    if (earned.current.has(id) || redeemed) return;
    earned.current.add(id);
    const slot = chips + pending.current;
    if (slot >= GOAL) return;
    const target = slots.current[slot];
    if (!target || reducedMotion()) return landChip(slot);

    // Fly a star from the check mark to its slot on the board.
    pending.current += 1;
    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const star = document.createElement('span');
    star.className = s.flyer;
    star.textContent = '★';
    star.style.left = `${a.left + a.width / 2}px`;
    star.style.top = `${a.top + a.height / 2}px`;
    document.body.appendChild(star);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const lift = Math.min(60, Math.abs(dy) * 0.35 + 24);
    star
      .animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.4 },
          { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.45 - lift}px)) scale(1.35)`, opacity: 1, offset: 0.5 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 },
        ],
        { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
      .finished.finally(() => {
        star.remove();
        pending.current -= 1;
        landChip(slot);
      });
  };

  const redeem = () => {
    setRedeemed(true);
    setAnnounce('Screen time redeemed. All done!');
  };

  const reset = () => {
    earned.current.clear();
    setDone(new Set());
    setChips(0);
    setRedeemed(false);
    setRunning(false);
    setRemaining(TIMER_S);
    setFirstDone(false);
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
                <span key={i} ref={(el) => void (slots.current[i] = el)} className={`${s.slot} ${i < chips && !redeemed ? s.slotOn : ''}`}>
                  ★
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
                  <span className={s.bigEmoji} aria-hidden="true">
                    📱
                  </span>
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
                      return (
                        <li key={m.id}>
                          <button type="button" className={`${s.item} ${on ? s.itemDone : ''}`} aria-pressed={on} onClick={(e) => toggle(m.id, e.currentTarget.querySelector(`.${s.check}`) as HTMLElement)}>
                            <span className={s.tile} aria-hidden="true">
                              {m.emoji}
                            </span>
                            <span className={s.label}>
                              {m.label}
                              <span className={s.time}>{m.time} AM</span>
                            </span>
                            <span className={s.check} aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path d="M6 12.5l4 4 8-9" />
                              </svg>
                            </span>
                          </button>
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
                <button type="button" className={`${s.ftCard} ${firstDone ? s.ftDone : ''}`} aria-pressed={firstDone} onClick={() => { setFirstDone((v) => !v); setAnnounce(firstDone ? 'Bath time not done.' : 'Bath time done. Then: play time.'); }}>
                  <span className={s.small}>First</span>
                  <span className={s.bigEmoji} aria-hidden="true">
                    🛁
                  </span>
                  <span>Bath time</span>
                  <span className={s.ftCheck} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M6 12.5l4 4 8-9" />
                    </svg>
                  </span>
                </button>
                <div className={`${s.ftCard} ${s.ftThen} ${firstDone ? s.ftNow : ''}`}>
                  <span className={s.small}>{firstDone ? 'Now' : 'Then'}</span>
                  <span className={s.bigEmoji} aria-hidden="true">
                    🧸
                  </span>
                  <span>Play time</span>
                </div>
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
