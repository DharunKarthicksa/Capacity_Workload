/**
 * Live versions of the design screens. They show real data where the pipeline has it and a plain
 * "no data yet" note where it does not (per-workspace data needs capacity operation events).
 */
import { useState, type ReactElement, type ReactNode } from "react";
import type { BpaFinding, CapacityDataSource, CapacityRef, LiveSummary, SeriesPoint } from "../../data/CapacityDataSource";
import { ANOMALY_THRESHOLD, HOURLY_ABOVE_MS } from "../../data/dax";
import { usePolling } from "../../hooks/usePolling";
import { Legend, LineChart, pointTime } from "../../components/LineChart";
import type { ScreenKey } from "../sample/types";
import { kpiIcons, type KpiIconName } from "../../shell/icons";
import { AddCapacity, shortName, type OnboardingConfig } from "./AddCapacity";

export { shortName };

export const REFRESH_MS = 30_000;

export interface LiveProps {
  source: CapacityDataSource;
  capacities: CapacityRef[];
  capacityId: string | undefined;
  /** Range length in milliseconds (2 h or 24 h in Live mode). */
  rangeMs: number;
  rangeLabel: string;
  /** Sends a question about something on screen to the data agent (drill-through from charts and rows). */
  onAsk?: (question: string) => void;
  /** Opens another screen, optionally for another capacity. */
  onOpen?: (screen: ScreenKey, capacityId?: string) => void;
  /** Enables the guided "add a capacity" flow. */
  onboarding?: OnboardingConfig;
  /** Asks the shell to re-read the monitored capacities (after one is added). */
  onCapacitiesChanged?: () => void;
}

// ---------- helpers ----------
export function pct(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return "-";
  return `${v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(2) : v === 0 ? "0" : v.toPrecision(2)}%`;
}

export function ago(from: Date | string | undefined): string {
  if (!from) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function p95(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))];
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function range(ms: number) {
  const to = new Date();
  return { from: new Date(to.getTime() - ms).toISOString(), to: to.toISOString() };
}

type Tone = "ok" | "warn" | "danger";
function riskTone(windowPct: number): Tone {
  return windowPct >= 80 ? "danger" : windowPct >= 50 ? "warn" : "ok";
}
const RISK_LABEL: Record<Tone, string> = { ok: "Healthy", warn: "Watch", danger: "At risk" };

// ---------- primitives ----------
function Title({ title, sub }: { title: string; sub: string }): ReactElement {
  return <div><h1 className="ci-h1">{title}</h1><p className="ci-sub">{sub}</p></div>;
}

function Kpi({ label, value, sub, tone, icon, href, go }: {
  label: string; value: string; sub?: string; tone?: Tone; icon?: KpiIconName;
  /** Makes the whole tile a link to another screen; `go` is the visible hint, for example "Open anomalies". */
  href?: string; go?: string;
}): ReactElement {
  const color = tone === "danger" ? "var(--ci-danger)" : tone === "warn" ? "var(--ci-warn)" : tone === "ok" ? "var(--ci-success)" : undefined;
  const body = (
    <>
      <div className="ci-kpi-head"><span className="ci-kpi-label">{label}</span>{icon ? <span className="ci-kpi-icon">{kpiIcons[icon]}</span> : null}</div>
      <span className="ci-kpi-value" style={color ? { color } : undefined}>{value}</span>
      {sub ? <span className="ci-kpi-sub">{sub}</span> : null}
      {href && go ? <span className="ci-go">{go} ›</span> : null}
    </>
  );
  return href ? <a className="ci-card" href={href}>{body}</a> : <section className="ci-card">{body}</section>;
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }): ReactElement {
  return (
    <section className="ci-card" aria-label={title}>
      <div><h2>{title}</h2>{sub ? <span className="ci-kpi-sub">{sub}</span> : null}</div>
      {children}
    </section>
  );
}

function NoData({ children }: { children: ReactNode }): ReactElement {
  return <div className="ci-nodata">{children}</div>;
}

function Err({ what, error }: { what: string; error: Error | undefined }): ReactElement | null {
  return error ? <div className="ci-error" role="alert">Could not load {what}: {error.message}</div> : null;
}

const NEEDS_OPS = "This needs capacity operation events (per workspace and item). None have arrived yet. Switch to Sample data in the header to see the design.";

function capName(caps: CapacityRef[], id: string | undefined): string {
  const c = caps.find((x) => x.capacityId === id);
  return c ? `${shortName(c.displayName)} · ${c.sku} · ${c.region}` : "No capacity selected";
}

const WINDOWS = [
  { key: "delay", label: "Interactive delay · 10 min", effect: "Delays interactive jobs 20 s at 100%", color: "var(--ci-warn)" },
  { key: "reject", label: "Interactive rejection · 60 min", effect: "Rejects interactive jobs at 100%", color: "var(--ci-brand)" },
  { key: "background", label: "Background rejection · 24 h", effect: "Rejects all jobs at 100%", color: "var(--ci-purple)" },
] as const;

function windowValues(s: LiveSummary | undefined): (number | undefined)[] {
  return [s?.interactiveDelayThresholdPercent, s?.interactiveRejectionThresholdPercent, s?.backgroundRejectionThresholdPercent];
}

/** The three throttling windows as labelled bars, as in the design's "Throttling risk" tile. */
function WindowBars({ summary }: { summary: LiveSummary | undefined }): ReactElement {
  const values = windowValues(summary);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      {WINDOWS.map((w, i) => (
        <div key={w.key}>
          <div className="ci-row" style={{ fontSize: 12 }}><span>{w.label}</span><strong>{pct(values[i])}</strong></div>
          <div className="ci-track"><i style={{ width: `${Math.min(100, Math.max(0, values[i] ?? 0))}%`, background: w.color }} /></div>
        </div>
      ))}
    </div>
  );
}

function useSummary(p: LiveProps) {
  return usePolling<LiveSummary | undefined>(
    () => (p.capacityId ? p.source.getLiveSummary(p.capacityId) : Promise.resolve(undefined)), [p.capacityId, p.source], REFRESH_MS);
}

function useSeries(p: LiveProps, ms: number) {
  return usePolling<SeriesPoint[]>(
    () => (p.capacityId ? p.source.getSeries(p.capacityId, range(ms)) : Promise.resolve([])), [p.capacityId, p.source, ms], REFRESH_MS);
}

function CuChart({ pts, onAsk }: { pts: SeriesPoint[]; onAsk?: (question: string) => void }): ReactElement {
  const lines = [
    { name: "Total CU %", color: "var(--ci-teal)", values: pts.map((x) => x.cuPercent) },
    { name: "Interactive", color: "var(--ci-brand)", values: pts.map((x) => x.interactivePercent) },
    { name: "Background", color: "var(--ci-purple)", values: pts.map((x) => x.backgroundPercent) },
  ];
  const marks = pts.flatMap((x, i) => ((x.anomalyScore ?? 0) > ANOMALY_THRESHOLD ? [i] : []));
  return (
    <>
      <LineChart times={pts.map((x) => new Date(x.timestamp).getTime())} series={lines} marks={marks}
        note={(i) => {
          const score = pts[i]?.anomalyScore;
          return score !== undefined && score > ANOMALY_THRESHOLD ? `Anomaly, score ${score.toFixed(1)}` : undefined;
        }}
        onPointClick={onAsk ? (i) => {
          const pt = pts[i];
          if (pt) onAsk(`What was happening around ${pointTime(new Date(pt.timestamp).getTime())}? CU was ${pct(pt.cuPercent)} (interactive ${pct(pt.interactivePercent)}, background ${pct(pt.backgroundPercent)}).`);
        } : undefined}
        clickHint="Click to ask the agent about this time" />
      <Legend series={lines} />
    </>
  );
}

// ---------- screens ----------
function Overview(p: LiveProps): ReactElement {
  const summary = useSummary(p);
  const series = useSeries(p, p.rangeMs);
  const s = summary.data;
  const pts = series.data ?? [];
  const cu = pts.map((x) => x.cuPercent);
  const hourly = p.rangeMs > HOURLY_ABOVE_MS;
  const top = (x: SeriesPoint) => x.cuMaxPercent ?? x.cuPercent;
  const peak = pts.reduce<SeriesPoint | undefined>((m, x) => (!m || top(x) > top(m) ? x : m), undefined);
  const peakValue = peak ? top(peak) : undefined;
  const open = pts.filter((x) => (x.anomalyScore ?? 0) > ANOMALY_THRESHOLD).length;
  const win = s?.interactiveDelayThresholdPercent ?? 0;
  const tone = riskTone(win);

  return (
    <>
      <Title title="Overview" sub={`${capName(p.capacities, p.capacityId)} · data every 30 seconds`} />
      <Err what="the live summary" error={summary.error} />
      <Err what="the series" error={series.error} />
      {s ? (
        <section className={`ci-banner ${tone}`} aria-label="Capacity status">
          <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 4 }}>
            <strong>{RISK_LABEL[tone]}: the 10-minute throttling window is {pct(win)} full</strong>
            <span style={{ fontSize: 13 }}>Interactive jobs are delayed when this window reaches 100%. Latest window ended {ago(s.asOf)}.</span>
          </div>
          <a className="ci-btn" href="#/throttling" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Open throttling</a>
        </section>
      ) : null}
      <div className="ci-grid">
        <a className="ci-card" href="#/throttling" aria-label="Throttling risk. Open throttling and headroom">
          <div className="ci-kpi-head"><span className="ci-kpi-label">Throttling risk</span><span className="ci-kpi-icon">{kpiIcons.gauge}</span></div>
          <span className="ci-kpi-value" style={s ? { color: `var(--ci-${tone === "ok" ? "success" : tone})` } : undefined}>{s ? pct(win) : "-"}</span>
          <span className="ci-kpi-sub">10-min window full · throttles at 100%</span>
          <WindowBars summary={s} />
          <span className="ci-go">Open throttling ›</span>
        </a>
        <Kpi icon="pulse" label="CU utilization now" value={s ? pct(s.cuPercent) : "-"}
          sub={`p95 ${p.rangeLabel.toLowerCase()} ${pct(p95(cu))}${hourly ? " (hourly averages)" : ""} · peak ${pct(peakValue)}${peak ? ` at ${hourly ? new Date(peak.timestamp).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : hhmm(peak.timestamp)}` : ""}`} />
        <Kpi icon="split" label="Interactive / background" value={s ? `${pct(s.interactivePercent)} · ${pct(s.backgroundPercent)}` : "-"} sub="Share of capacity now" />
        <Kpi icon="alert" label="Open anomalies" value={String(open)} sub={`Score above ${ANOMALY_THRESHOLD}, ${p.rangeLabel.toLowerCase()}`} tone={open > 0 ? "danger" : undefined}
          href="#/anomalies" go="Open anomalies" />
      </div>
      <Card title={`CU utilization, ${p.rangeLabel.toLowerCase()}`}
        sub={hourly ? "CU as a share of the capacity, hourly average" : "CU as a share of the capacity, per 30-second timepoint"}>
        <CuChart pts={pts} onAsk={p.onAsk} />
      </Card>
      <div className="ci-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Card title="Top workspaces by CU"><NoData>{NEEDS_OPS}</NoData></Card>
        <Card title="What changed"><NoData>{NEEDS_OPS}</NoData></Card>
      </div>
    </>
  );
}

function AllCapacities(p: LiveProps): ReactElement {
  const all = usePolling(
    () => Promise.all(p.capacities.map((c) => p.source.getLiveSummary(c.capacityId).catch(() => undefined))),
    [p.capacities, p.source], REFRESH_MS);
  const rows = (all.data ?? []).filter((x): x is LiveSummary => x !== undefined);
  const atRisk = rows.filter((r) => riskTone(r.interactiveDelayThresholdPercent) !== "ok").length;
  return (
    <>
      <Title title="All capacities" sub="Every capacity that sends events to this app, so you know where to look first" />
      <Err what="capacities" error={all.error} />
      <div className="ci-grid">
        <Kpi icon="grid" label="Capacities monitored" value={String(p.capacities.length)} sub="Sending capacity overview events" />
        <Kpi icon="alert" label="At risk now" value={String(atRisk)} sub="10-min window at 50% or more" tone={atRisk > 0 ? "warn" : undefined} />
        <Kpi icon="gauge" label="Throttled now" value={String(rows.filter((r) => r.throttling !== "None").length)} sub="From overage on the latest window" />
      </div>
      <div className="ci-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {rows.map((r) => {
          const tone = riskTone(r.interactiveDelayThresholdPercent);
          return (
            <section className="ci-card" key={r.capacity.capacityId}>
              <div className="ci-row" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ overflowWrap: "anywhere" }} title={r.capacity.displayName}>{shortName(r.capacity.displayName)}</h2>
                  <span className="ci-kpi-sub">{r.capacity.sku} · {r.capacity.region}</span>
                </div>
                <span className={`ci-pill ${tone}`}>{RISK_LABEL[tone]}</span>
              </div>
              <div className="ci-row"><span>CU now</span><strong>{pct(r.cuPercent)}</strong></div>
              <div className="ci-row"><span>10-min window</span><strong>{pct(r.interactiveDelayThresholdPercent)}</strong></div>
              <div className="ci-row"><span>60-min window</span><strong>{pct(r.interactiveRejectionThresholdPercent)}</strong></div>
              <div className="ci-row"><span>24-h window</span><strong>{pct(r.backgroundRejectionThresholdPercent)}</strong></div>
              <div className="ci-row"><span>Last event</span><span className="ci-muted">{ago(r.asOf)}</span></div>
              <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                <button type="button" className="ci-linkbtn" onClick={() => p.onOpen?.("overview", r.capacity.capacityId)}>Open overview ›</button>
                <button type="button" className="ci-linkbtn" onClick={() => p.onOpen?.("throttling", r.capacity.capacityId)}>Open throttling ›</button>
              </div>
            </section>
          );
        })}
      </div>
      {rows.length === 0 && !all.loading ? <NoData>No capacity has sent events yet.</NoData> : null}
      {p.onboarding ? <AddCapacity config={p.onboarding} monitored={p.capacities} source={p.source} onConnected={p.onCapacitiesChanged} /> : null}
    </>
  );
}

function Anomalies(p: LiveProps): ReactElement {
  const series = useSeries(p, 24 * 3_600_000);
  const anomalies = usePolling(
    () => (p.capacityId ? p.source.getAnomalies(p.capacityId, range(24 * 3_600_000)) : Promise.resolve([])), [p.capacityId, p.source], REFRESH_MS);
  const pts = series.data ?? [];
  const scored = pts.filter((x) => x.anomalyScore !== undefined).length;
  const list = anomalies.data ?? [];
  return (
    <>
      <Title title="Anomalies & root cause" sub="Each point is scored against the same hour of the week over the last 4 weeks" />
      <Err what="the series" error={series.error} />
      <Err what="anomalies" error={anomalies.error} />
      <Card title="Last 24 hours, anomalies marked"
        sub={pts.length > 0 && scored === 0
          ? "No points are scored yet: the baseline needs more history before scores appear."
          : `${scored} of ${pts.length} points scored. A point is an anomaly when its score is above ${ANOMALY_THRESHOLD}.`}>
        <CuChart pts={pts} onAsk={p.onAsk} />
      </Card>
      <Card title={`Anomalies (${list.length})`} sub={capName(p.capacities, p.capacityId)}>
        {list.length === 0 ? <div className="ci-empty">No anomalies in the last 24 hours</div> : (
          <div className="ci-table-wrap">
            <table className="ci-table">
              <thead><tr><th>Detected</th><th>Score</th><th>CU %</th><th>Status</th><th><span className="ci-sr">Actions</span></th></tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.anomalyId}>
                    <td>{new Date(a.detectedAt).toLocaleString()}</td><td>{a.score.toFixed(1)}</td><td>{pct(a.cuPercent)}</td>
                    <td><span className={`ci-pill ${a.open ? "danger" : ""}`}>{a.open ? "Open" : "Past"}</span></td>
                    <td>{p.onAsk ? (
                      <button type="button" className="ci-linkbtn"
                        onClick={() => p.onAsk?.(`Explain the anomaly at ${pointTime(new Date(a.detectedAt).getTime())}: CU was ${pct(a.cuPercent)} with a score of ${a.score.toFixed(1)}. What is the likely cause?`)}>
                        Ask why ›
                      </button>
                    ) : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Root cause: what added the extra load"><NoData>{NEEDS_OPS}</NoData></Card>
    </>
  );
}

function Throttling(p: LiveProps): ReactElement {
  const summary = useSummary(p);
  const series = useSeries(p, p.rangeMs);
  const s = summary.data;
  const worst = s?.interactiveDelayThresholdPercent ?? 0;
  const wpts = series.data ?? [];
  const wlines = [
    { name: "Interactive delay (10 min)", color: WINDOWS[0].color, values: wpts.map((x) => x.delayWindowPercent ?? 0) },
    { name: "Interactive rejection (60 min)", color: WINDOWS[1].color, values: wpts.map((x) => x.rejectionWindowPercent ?? 0) },
    { name: "Background rejection (24 h)", color: WINDOWS[2].color, values: wpts.map((x) => x.backgroundRejectionWindowPercent ?? 0) },
  ];
  return (
    <>
      <Title title="Throttling & headroom" sub={`How close ${capName(p.capacities, p.capacityId)} is to each throttling stage`} />
      <Err what="the live summary" error={summary.error} />
      <div className="ci-grid">
        {WINDOWS.map((w, i) => {
          const v = windowValues(s)[i];
          return <Kpi key={w.key} icon="gauge" label={w.label} value={pct(v)} sub={w.effect} tone={v === undefined ? undefined : riskTone(v)} />;
        })}
        <Kpi icon="clock" label="Time to recover" value={s ? (worst > 100 ? `${Math.ceil(((worst - 100) / 100) * 10)} min or more` : "Not throttled") : "-"}
          sub="If throttled: (% − 100) ÷ 100 × window" />
      </div>
      <Card title={`Throttling windows, ${p.rangeLabel.toLowerCase()}`}
        sub={`Share of future capacity already committed in each window${p.rangeMs > HOURLY_ABOVE_MS ? ", highest value per hour" : ""}`}>
        <LineChart times={wpts.map((x) => new Date(x.timestamp).getTime())} series={wlines}
          onPointClick={p.onAsk ? (i) => {
            const pt = wpts[i];
            if (pt) p.onAsk?.(`Why were the throttling windows at this level around ${pointTime(new Date(pt.timestamp).getTime())}? 10-minute ${pct(pt.delayWindowPercent)}, 60-minute ${pct(pt.rejectionWindowPercent)}, 24-hour ${pct(pt.backgroundRejectionWindowPercent)}.`);
          } : undefined}
          clickHint="Click to ask the agent about this time" />
        <Legend series={wlines} />
      </Card>
      <Card title={`CU utilization, ${p.rangeLabel.toLowerCase()}`}><CuChart pts={wpts} onAsk={p.onAsk} /></Card>
      <Card title="When it gets busy · How to get headroom">
        <NoData>The weekday by hour view needs about 4 weeks of history. The headroom options need per-workspace data.</NoData>
      </Card>
    </>
  );
}

interface ModelRow { id: string; name: string; workspace: string; errors: number; warnings: number; infos: number; topRule: string }

function ModelHealth(p: LiveProps): ReactElement {
  const bpa = usePolling<BpaFinding[]>(() => p.source.getBpaFindings(), [p.source], 10 * 60_000);
  const [category, setCategory] = useState<string>();
  const [openModel, setOpenModel] = useState<string>();
  const rows = bpa.data ?? [];
  const byModel = new Map<string, ModelRow & { rules: Map<string, number> }>();
  const byCat = new Map<string, number>();
  for (const f of rows) {
    let m = byModel.get(f.modelId);
    if (!m) {
      m = { id: f.modelId, name: f.modelName ?? f.modelId, workspace: f.workspaceName ?? f.workspaceId, errors: 0, warnings: 0, infos: 0, topRule: "", rules: new Map() };
      byModel.set(f.modelId, m);
    }
    if (f.severity === "Error") m.errors++; else if (f.severity === "Warning") m.warnings++; else m.infos++;
    if (f.severity !== "Info") m.rules.set(f.rule, (m.rules.get(f.rule) ?? 0) + (f.severity === "Error" ? 100 : 1));
    byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1);
  }
  const models = [...byModel.values()]
    .map((m) => ({ ...m, topRule: [...m.rules.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-" }))
    .sort((a, b) => b.errors - a.errors || b.warnings - a.warnings);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;
  const scannedAt = rows[0]?.scannedAt;
  const inCategory = (m: { id: string }) => !category || rows.some((f) => f.modelId === m.id && f.category === category);
  const shown = models.filter(inCategory);
  const picked = models.find((m) => m.id === openModel);
  const order = { Error: 0, Warning: 1, Info: 2 } as const;
  const detail = rows
    .filter((f) => f.modelId === openModel && (!category || f.category === category))
    .sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule));
  return (
    <>
      <Title title="Model health" sub="Best Practice Analyzer findings for the semantic models in the monitored workspace" />
      <Err what="model findings" error={bpa.error} />
      <div className="ci-grid">
        <Kpi icon="model" label="Models with findings" value={String(models.length)} sub={scannedAt ? `Last scan ${new Date(scannedAt).toLocaleString()} · daily` : "No scan yet"} />
        <Kpi icon="alert" label="Models with errors" value={String(models.filter((m) => m.errors > 0).length)} sub={`${rows.filter((f) => f.severity === "Error").length} error findings in total`} tone={models.some((m) => m.errors > 0) ? "danger" : undefined} />
        <Kpi icon="check" label="Warnings" value={String(rows.filter((f) => f.severity === "Warning").length)} sub={`Across ${models.filter((m) => m.warnings > 0).length} models`} />
        <Kpi icon="pulse" label="CU used by flagged models" value="-" sub="Needs per-item CU (operation events)" />
      </div>
      <Card title="Findings by rule category" sub={`Best Practice Analyzer rules via semantic-link-labs · ${rows.length} findings`}>
        {cats.map(([c, n]) => (
          <button type="button" className="ci-barrow" key={c} aria-pressed={category === c}
            title={`${n} findings, ${Math.round((n / Math.max(1, rows.length)) * 100)}% of all. Select to filter the models below.`}
            onClick={() => setCategory(category === c ? undefined : c)}>
            <div className="ci-row"><span>{c}</span><span className="ci-muted">{n}</span></div>
            <div className="ci-track"><i style={{ width: `${Math.max(2, (n / maxCat) * 100)}%` }} /></div>
          </button>
        ))}
        {cats.length > 0 ? <span className="ci-kpi-sub">{category ? `Showing models with ${category} findings. Select it again to clear.` : "Select a category to filter the models below."}</span> : null}
        {cats.length === 0 && !bpa.loading ? <div className="ci-empty">No findings yet</div> : null}
      </Card>
      <Card title={category ? `Models to fix · ${category}` : "Models to fix"} sub="Sorted by errors, then warnings. Select a model to see its findings.">
        <div className="ci-table-wrap">
          <table className="ci-table">
            <thead><tr><th>Model</th><th>Workspace</th><th>Errors</th><th>Warnings</th><th>Info</th><th>Top rule</th></tr></thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="ci-click" tabIndex={0} aria-selected={openModel === m.id}
                  onClick={() => setOpenModel(openModel === m.id ? undefined : m.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenModel(openModel === m.id ? undefined : m.id); } }}>
                  <td><strong>{m.name}</strong></td><td>{m.workspace}</td>
                  <td>{m.errors > 0 ? <span className="ci-pill danger">{m.errors}</span> : 0}</td>
                  <td>{m.warnings}</td><td>{m.infos}</td><td>{m.topRule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {picked ? (
        <Card title={`${picked.name} · what to change`} sub={`${detail.length} findings${category ? ` in ${category}` : ""} · ${picked.workspace}`}>
          <div style={{ display: "flex", gap: 16 }}>
            {p.onAsk ? (
              <button type="button" className="ci-linkbtn"
                onClick={() => p.onAsk?.(`For the semantic model "${picked.name}", which Best Practice Analyzer findings should be fixed first, and how? It has ${picked.errors} errors and ${picked.warnings} warnings.`)}>
                Ask the agent what to fix first ›
              </button>
            ) : null}
            <button type="button" className="ci-linkbtn" onClick={() => setOpenModel(undefined)}>Close</button>
          </div>
          <div className="ci-table-wrap">
            <table className="ci-table">
              <thead><tr><th>Severity</th><th>Rule</th><th>Category</th><th>Where and why</th></tr></thead>
              <tbody>
                {detail.slice(0, 60).map((f, i) => (
                  <tr key={i}>
                    <td><span className={`ci-pill ${f.severity === "Error" ? "danger" : f.severity === "Warning" ? "warn" : ""}`}>{f.severity}</span></td>
                    <td>{f.rule}</td><td>{f.category}</td><td>{f.description ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.length > 60 ? <span className="ci-kpi-sub">Showing the first 60 of {detail.length}, errors first.</span> : null}
        </Card>
      ) : null}
    </>
  );
}

function AlertsSettings(p: LiveProps): ReactElement {
  const all = usePolling(
    () => Promise.all(p.capacities.map((c) => p.source.getLiveSummary(c.capacityId).catch(() => undefined))), [p.capacities, p.source], REFRESH_MS);
  const bpa = usePolling<BpaFinding[]>(() => p.source.getBpaFindings(), [p.source], 10 * 60_000);
  const latest = (all.data ?? []).filter((x): x is LiveSummary => !!x).map((x) => new Date(x.asOf).getTime()).sort((a, b) => b - a)[0];
  const ageS = latest ? (Date.now() - latest) / 1000 : undefined;
  const flowing = ageS !== undefined && ageS < 300;
  const scan = bpa.data?.[0]?.scannedAt;
  const scanFresh = scan ? Date.now() - new Date(scan).getTime() < 36 * 3_600_000 : false;
  const item = (name: string, kind: string, ok: boolean | undefined, label: string, detail: string) => (
    <section className="ci-card" key={name}>
      <div className="ci-row"><h2>{name}</h2><span className={`ci-pill ${ok === undefined ? "" : ok ? "ok" : "danger"}`}>{label}</span></div>
      <span className="ci-kpi-sub">{kind}</span><span style={{ fontSize: 13 }}>{detail}</span>
    </section>
  );
  return (
    <>
      <Title title="Alerts & settings" sub="What the app watches, and whether its own pipeline is healthy" />
      <Card title="Is the data flowing?" sub="The app watches its own pipeline, so a quiet dashboard never hides a broken feed">
        <div className="ci-grid">
          {item("Capacity events", "ci-capacity-overview · Eventstream", latest ? flowing : undefined, latest ? (flowing ? "Running" : "Stale") : "Unknown",
            latest ? `Last event ${ago(new Date(latest))} · ${p.capacities.length} capacity` : "No events seen")}
          {item("Ingestion", "ci-eventhouse · KQL database", latest ? flowing : undefined, latest ? (flowing ? "Healthy" : "Check") : "Unknown", "Rows are usually queryable within a minute of the event")}
          {item("Model scan", "ci-bpa-scan · Notebook", scan ? scanFresh : undefined, scan ? (scanFresh ? "Healthy" : "Stale") : "Unknown",
            scan ? `Last scan ${new Date(scan).toLocaleString()} · daily` : "No scan found")}
          {item("Anomaly baseline", "ci-baseline-refresh · Notebook", undefined, "Scheduled", "Hourly. Run status is not exposed to the app yet.")}
          {item("Rebalance job", "Not built", undefined, "Off", "Propose and audit only. Nothing moves a workspace.")}
          {item("Data agent", "Not connected", undefined, "Off", "Depends on the Ask AI test (decision 002).")}
        </div>
      </Card>
      <Card title="Alert rules" sub="Run on Fabric Activator, so alerts fire even when this app is closed">
        <NoData>No rules exist yet. They are created by hand in Activator: throttling window above 95%, and anomaly score above {ANOMALY_THRESHOLD}.</NoData>
      </Card>
      <Card title="Monitored capacities" sub={`${p.capacities.length} sending events`}>
        {p.capacities.map((c) => <div className="ci-row" key={c.capacityId}><span title={c.displayName}>{shortName(c.displayName)}</span><span className="ci-muted">{c.sku} · {c.region}</span></div>)}
        {p.onboarding ? <button type="button" className="ci-linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => p.onOpen?.("all-capacities")}>Add a capacity ›</button> : null}
      </Card>
    </>
  );
}

function OpsOnly({ title, sub }: { title: string; sub: string }): ReactElement {
  return <><Title title={title} sub={sub} /><NoData>{NEEDS_OPS}</NoData></>;
}

export function LiveScreen({ screen, ...p }: LiveProps & { screen: ScreenKey }): ReactElement {
  switch (screen) {
    case "all-capacities": return <AllCapacities {...p} />;
    case "overview": return <Overview {...p} />;
    case "anomalies": return <Anomalies {...p} />;
    case "throttling": return <Throttling {...p} />;
    case "model-health": return <ModelHealth {...p} />;
    case "alerts-settings": return <AlertsSettings {...p} />;
    case "workspaces": return <OpsOnly title="Workspaces & items" sub="Who uses the capacity, what they run, and what changed" />;
    case "rebalance": return (
      <>
        <Title title="Rebalance" sub="Moves that even out load across capacities in the same region · proposals only, a person approves" />
        <NoData>Proposals need per-workspace CU and a second capacity in the same region. Neither exists yet, and this build never moves a workspace. Switch to Sample data in the header to see the design.</NoData>
      </>
    );
  }
}
