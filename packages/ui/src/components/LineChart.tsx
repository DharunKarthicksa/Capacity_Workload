import { useState, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";

export interface ChartSeries {
  name: string;
  /** CSS color, normally a var(--ci-...) token. */
  color: string;
  values: number[];
}

export interface LineChartProps {
  /** Epoch milliseconds, one per point, ascending. */
  times: number[];
  series: ChartSeries[];
  /** Indices into `times` to mark as anomalies. */
  marks?: number[];
  unit?: string;
  height?: number;
  /** Extra line for the tooltip at a point, for example "Anomaly, score 3.6". */
  note?: (index: number) => string | undefined;
  /** Called when a point is clicked or chosen with Enter. Makes the chart a drill-through. */
  onPointClick?: (index: number) => void;
  /** What a click does, shown at the bottom of the tooltip (for example "Click to ask the agent about this time"). */
  clickHint?: string;
}

const W = 800;
const PAD = { l: 52, r: 12, t: 12, b: 26 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function fmt(v: number): string {
  if (v === 0) return "0";
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toPrecision(2);
}

const two = (n: number) => String(n).padStart(2, "0");

function axisLabel(ms: number, longRange: boolean): string {
  const d = new Date(ms);
  return longRange ? `${d.getDate()}/${d.getMonth() + 1} ${two(d.getHours())}:00` : `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Full local time for the tooltip, for example "Thu 19 Nov, 14:10:30". */
export function pointTime(ms: number): string {
  return new Date(ms).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Small dependency-free SVG line chart. The y axis auto-scales, so an idle capacity is shown at its true (tiny) level.
 * Hover or use the arrow keys to read a point; with `onPointClick`, a click or Enter drills through.
 */
export function LineChart({ times, series, marks = [], unit = "%", height = 260, note, onPointClick, clickHint }: LineChartProps): ReactElement {
  const [active, setActive] = useState<number>();
  if (times.length === 0) return <div className="ci-empty">No data in this range</div>;

  const h = height;
  const yMax = niceMax(Math.max(...series.flatMap((s) => s.values), 0) * 1.1);
  const t0 = times[0]!;
  const t1 = times[times.length - 1]!;
  const longRange = t1 - t0 > 26 * 3_600_000;
  const x = (t: number) => PAD.l + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - Math.min(v, yMax) / yMax) * (h - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xticks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0));

  const nearest = (target: number): number => {
    let lo = 0;
    let hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid]! < target) lo = mid; else hi = mid;
    }
    return target - times[lo]! <= times[hi]! - target ? lo : hi;
  };
  const indexAt = (e: MouseEvent<SVGSVGElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const f = Math.min(1, Math.max(0, (vx - PAD.l) / (W - PAD.l - PAD.r)));
    return nearest(t0 + f * (t1 - t0));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const last = times.length - 1;
    const step = Math.max(1, Math.round(times.length / 60));
    if (e.key === "ArrowRight") { e.preventDefault(); setActive((i) => Math.min(last, (i ?? -1) + step)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setActive((i) => Math.max(0, (i ?? last + 1) - step)); }
    else if (e.key === "Escape") setActive(undefined);
    else if ((e.key === "Enter" || e.key === " ") && active !== undefined && onPointClick) { e.preventDefault(); onPointClick(active); }
  };

  const ax = active !== undefined ? x(times[active]!) : 0;
  const leftPct = (ax / W) * 100;
  const extra = active !== undefined ? note?.(active) : undefined;

  return (
    <div className="ci-chart-wrap">
      <svg className="ci-chart" viewBox={`0 0 ${W} ${h}`} role="img" tabIndex={0} preserveAspectRatio="none"
        aria-label={`Chart of ${series.map((s) => s.name).join(", ")}. Use the left and right arrow keys to read values${onPointClick ? ", Enter to open" : ""}.`}
        style={{ cursor: onPointClick ? "pointer" : "crosshair" }}
        onMouseMove={(e) => setActive(indexAt(e))} onMouseLeave={() => setActive(undefined)} onBlur={() => setActive(undefined)}
        onClick={(e) => onPointClick?.(indexAt(e))} onKeyDown={onKey}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="ci-grid-line" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="ci-axis">{fmt(v)}{unit}</text>
          </g>
        ))}
        {xticks.map((t) => (
          <text key={t} x={x(t)} y={h - 6} textAnchor="middle" className="ci-axis">{axisLabel(t, longRange)}</text>
        ))}
        {series.map((s) => (
          <polyline
            key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round"
            points={s.values.map((v, i) => `${x(times[i]!).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
          />
        ))}
        {marks.map((i) => (
          <circle key={i} cx={x(times[i]!)} cy={y(series[0]?.values[i] ?? 0)} r={5} className="ci-mark" />
        ))}
        {active !== undefined ? (
          <g pointerEvents="none">
            <line x1={ax} x2={ax} y1={PAD.t} y2={h - PAD.b} className="ci-cursor" />
            {series.map((s) => (
              <circle key={s.name} cx={ax} cy={y(s.values[active] ?? 0)} r={4.5} fill={s.color} className="ci-cursor-dot" />
            ))}
          </g>
        ) : null}
      </svg>
      {active !== undefined ? (
        <div className="ci-tip" role="status" style={leftPct > 60 ? { right: `${100 - leftPct + 2}%` } : { left: `${leftPct + 2}%` }}>
          <div className="ci-tip-time">{pointTime(times[active]!)}</div>
          {series.map((s) => (
            <div className="ci-tip-row" key={s.name}>
              <span><i style={{ background: s.color }} />{s.name}</span>
              <strong>{fmt(s.values[active] ?? 0)}{unit}</strong>
            </div>
          ))}
          {extra ? <div className="ci-tip-note">{extra}</div> : null}
          {onPointClick && clickHint ? <div className="ci-tip-hint">{clickHint}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function Legend({ series }: { series: ChartSeries[] }): ReactElement {
  return (
    <div className="ci-legend">
      {series.map((s) => (
        <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>
      ))}
    </div>
  );
}
