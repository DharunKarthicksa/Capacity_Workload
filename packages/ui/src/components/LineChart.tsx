import type { ReactElement } from "react";

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

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Small dependency-free SVG line chart. The y axis auto-scales, so an idle capacity is shown at its true (tiny) level. */
export function LineChart({ times, series, marks = [], unit = "%", height = 260 }: LineChartProps): ReactElement {
  if (times.length === 0) return <div className="ci-empty">No data in this range</div>;

  const h = height;
  const yMax = niceMax(Math.max(...series.flatMap((s) => s.values), 0) * 1.1);
  const t0 = times[0]!;
  const t1 = times[times.length - 1]!;
  const x = (t: number) => PAD.l + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - Math.min(v, yMax) / yMax) * (h - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xticks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0));

  return (
    <svg className="ci-chart" viewBox={`0 0 ${W} ${h}`} role="img" aria-label="Capacity utilisation over time" preserveAspectRatio="none">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="ci-grid" />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="ci-axis">{fmt(v)}{unit}</text>
        </g>
      ))}
      {xticks.map((t) => (
        <text key={t} x={x(t)} y={h - 6} textAnchor="middle" className="ci-axis">{hhmm(t)}</text>
      ))}
      {series.map((s) => (
        <polyline
          key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round"
          points={s.values.map((v, i) => `${x(times[i]!).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
        />
      ))}
      {marks.map((i) => (
        <circle key={i} cx={x(times[i]!)} cy={y(series[0]?.values[i] ?? 0)} r={5} className="ci-mark">
          <title>Anomaly</title>
        </circle>
      ))}
    </svg>
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
