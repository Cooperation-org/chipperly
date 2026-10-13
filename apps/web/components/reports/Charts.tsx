import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { axisLabel, barRects, labelIndexes, linePoints, niceMax, shortDate, slotCentre, stackHeights } from '@/lib/reports/charts';
import styles from './Charts.module.css';

const W = 320;
const H = 140;
const PAD_TOP = 8;
const LABEL_H = 18;

export interface ChartDay {
  date: string;
}

interface FrameProps {
  title: string;
  /** One sentence for screen readers that says what the chart shows. */
  summary: string;
  dates: string[];
  max: number;
  children: React.ReactNode;
  legend?: React.ReactNode;
  /** The same numbers as a table, read instead of the picture by screen readers. */
  table: { head: string[]; rows: (string | number)[][] };
}

function Frame({ title, summary, dates, max, children, legend, table }: FrameProps) {
  const n = dates.length;
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.title}>{title}</figcaption>
      <svg className={styles.svg} viewBox={`0 0 ${W} ${H + LABEL_H + PAD_TOP}`} role="img" aria-label={`${title}. ${summary}`}>
        <g transform={`translate(0 ${PAD_TOP})`}>
          <line className={styles.axis} x1={0} y1={H} x2={W} y2={H} />
          <line className={styles.grid} x1={0} y1={0} x2={W} y2={0} />
          <text className={styles.tick} x={2} y={-1}>{max}</text>
          {children}
          {labelIndexes(n).map((i) => (
            <text key={dates[i]} className={styles.label} x={slotCentre(i, n, W)} y={H + 13} textAnchor="middle">
              {axisLabel(dates[i]!, n)}
            </text>
          ))}
        </g>
      </svg>
      {legend}
      <VisuallyHidden as="table">
        <caption>{title}</caption>
        <thead>
          <tr>
            {table.head.map((h) => (
              <th key={h} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </VisuallyHidden>
    </figure>
  );
}

const total = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/** Bars: done tasks per day, with the planned count as a pale bar behind. */
export function TasksChart({ dates, done, planned }: { dates: string[]; done: number[]; planned: number[] }) {
  const max = niceMax(Math.max(0, ...planned, ...done));
  const slot = barRects(planned, max, W, H);
  const front = barRects(done, max, W, H);
  return (
    <Frame
      title="Tasks done each day"
      summary={`${total(done)} of ${total(planned)} planned tasks done.`}
      dates={dates}
      max={max}
      table={{ head: ['Day', 'Done', 'Planned'], rows: dates.map((d, i) => [shortDate(d), done[i]!, planned[i]!]) }}
      legend={
        <p className={styles.legend}>
          <span className={styles.keyDone} aria-hidden /> Done <span className={styles.keyPlanned} aria-hidden /> Planned
        </p>
      }
    >
      {slot.map((b, i) => (
        <rect key={`p${dates[i]}`} className={styles.planned} x={b.x} y={b.y} width={b.width} height={b.height} rx={2} />
      ))}
      {front.map((b, i) => (
        <rect key={`d${dates[i]}`} className={styles.done} x={b.x} y={b.y} width={b.width} height={b.height} rx={2} />
      ))}
    </Frame>
  );
}

/** A line over the days, with a dot on each. Used for chips earned and for active people. */
export function LineChart({ title, noun, dates, values }: { title: string; noun: string; dates: string[]; values: number[] }) {
  const max = niceMax(Math.max(0, ...values));
  const cx = (i: number): number => slotCentre(i, dates.length, W);
  return (
    <Frame
      title={title}
      summary={`${total(values)} ${noun} in total.`}
      dates={dates}
      max={max}
      table={{ head: ['Day', noun], rows: dates.map((d, i) => [shortDate(d), values[i]!]) }}
    >
      <polyline className={styles.line} points={linePoints(values, max, W, H)} />
      {values.map((v, i) => (
        <circle key={dates[i]} className={styles.dot} cx={cx(i)} cy={H - (max > 0 ? (v / max) * H : 0)} r={dates.length > 7 ? 2.5 : 3.5} />
      ))}
    </Frame>
  );
}

export const FEELING_NAMES = ['Very low', 'Low', 'Okay', 'Good', 'Great'];
const FEELING_COLORS = ['#b3261e', '#f7931e', '#c9b537', '#71a6a6', '#2e8b57'];

/** Stacked bars: how many times each feeling (1 to 5) was picked that day. */
export function FeelingsChart({ dates, counts }: { dates: string[]; counts: number[][] }) {
  const max = niceMax(Math.max(0, ...counts.map(total)));
  const barW = (W - 4 * (dates.length - 1)) / dates.length;
  return (
    <Frame
      title="Feelings each day"
      summary={`${total(counts.map(total))} feelings picked.`}
      dates={dates}
      max={max}
      table={{ head: ['Day', ...FEELING_NAMES], rows: dates.map((d, i) => [shortDate(d), ...counts[i]!]) }}
      legend={
        <p className={styles.legend}>
          {FEELING_NAMES.map((name, i) => (
            <span key={name} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: FEELING_COLORS[i] }} aria-hidden /> {name}
            </span>
          ))}
        </p>
      }
    >
      {counts.map((c, i) => {
        const heights = stackHeights(c, max, H);
        let y = H;
        return heights.map((h, level) => {
          y -= h;
          return h > 0 ? <rect key={`${dates[i]}${level}`} x={i * (barW + 4)} y={y} width={barW} height={h} fill={FEELING_COLORS[level]} /> : null;
        });
      })}
    </Frame>
  );
}
