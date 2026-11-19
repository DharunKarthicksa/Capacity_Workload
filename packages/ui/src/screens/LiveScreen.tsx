import type { ReactElement } from "react";
import type { CapacityDataSource, LiveSummary } from "../data/CapacityDataSource";
import { usePolling } from "../hooks/usePolling";
import { Legend, LineChart } from "../components/LineChart";
import { ANOMALY_THRESHOLD } from "../data/dax";

export const REFRESH_MS = 30_000;
const RANGE_MS = 2 * 3_600_000;

function pct(v: number): string {
  return v >= 10 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(2) : v.toPrecision(2);
}

function ago(from: Date | string | undefined): string {
  if (!from) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 1000));
  return s < 90 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "ok" }): ReactElement {
  return (
    <div className="ci-tile">
      <div className="ci-tile-label">{label}</div>
      <div className="ci-tile-value" style={tone ? { color: `var(--ci-${tone})` } : undefined}>{value}</div>
      {sub ? <div className="ci-tile-sub">{sub}</div> : null}
    </div>
  );
}

function throttleTone(s: LiveSummary): "warn" | "ok" {
  return s.throttling === "None" ? "ok" : "warn";
}

/** Live view: current CU %, interactive and background split, throttling state, and the last 2 hours at 30-second resolution. */
export function LiveScreen({ source, capacityId }: { source: CapacityDataSource; capacityId: string }): ReactElement {
  const summary = usePolling(() => source.getLiveSummary(capacityId), [capacityId, source], REFRESH_MS);
  const series = usePolling(() => {
    const to = new Date();
    return source.getSeries(capacityId, { from: new Date(to.getTime() - RANGE_MS).toISOString(), to: to.toISOString() });
  }, [capacityId, source], REFRESH_MS);

  const s = summary.data;
  const pts = series.data ?? [];
  const times = pts.map((p) => new Date(p.timestamp).getTime());
  const marks = pts.flatMap((p, i) => ((p.anomalyScore ?? 0) > ANOMALY_THRESHOLD ? [i] : []));
  const lines = [
    { name: "CU %", color: "var(--ci-brand)", values: pts.map((p) => p.cuPercent) },
    { name: "Interactive %", color: "var(--ci-interactive)", values: pts.map((p) => p.interactivePercent) },
    { name: "Background %", color: "var(--ci-background)", values: pts.map((p) => p.backgroundPercent) },
  ];
  const stale = s ? Date.now() - new Date(s.asOf).getTime() > 120_000 : false;

  return (
    <section aria-label="Live capacity">
      {summary.error ? <div className="ci-error" role="alert">Could not load the live summary: {summary.error.message}</div> : null}
      {series.error ? <div className="ci-error" role="alert">Could not load the series: {series.error.message}</div> : null}

      <div className="ci-tiles">
        <Tile label="CU % (latest 30 s window)" value={s ? `${pct(s.cuPercent)}%` : "-"} sub={s ? `${s.capacity.sku} in ${s.capacity.region}` : undefined} />
        <Tile label="Interactive %" value={s ? `${pct(s.interactivePercent)}%` : "-"} />
        <Tile label="Background %" value={s ? `${pct(s.backgroundPercent)}%` : "-"} />
        <Tile label="Throttling" value={s ? s.throttling : "-"} tone={s ? throttleTone(s) : undefined}
          sub={s ? `Delay threshold ${s.interactiveDelayThresholdPercent}%` : undefined} />
        <Tile label="Data age" value={s ? ago(s.asOf) : "-"} tone={stale ? "warn" : undefined}
          sub={stale ? "No event for over 2 minutes" : "Window end time"} />
      </div>

      <div className="ci-panel">
        <h2>Last 2 hours</h2>
        <LineChart times={times} series={lines} marks={marks} />
        <Legend series={lines} />
      </div>
      <div className="ci-muted">Refreshes every 30 s. Last refresh {ago(series.updatedAt)}.</div>
    </section>
  );
}
