import { useEffect, useRef, useState, type MouseEvent, type ReactElement, type ReactNode } from "react";
import type { CapacityDataSource } from "../data/CapacityDataSource";
import { usePolling } from "../hooks/usePolling";
import { sampleScreens } from "../screens/sample";
import type { ScreenKey } from "../screens/sample/types";
import type { OnboardingConfig } from "../screens/live/AddCapacity";
import { LiveScreen, ago, shortName } from "../screens/live/LiveScreens";
import { ArrowUpRightIcon, DatabaseIcon, LogoIcon, MoonIcon, RefreshIcon, SendIcon, SparkIcon, SunIcon, navIcons } from "./icons";

type Mode = "live" | "sample";

const NAV: { key: ScreenKey; label: string; short: string }[] = [
  { key: "all-capacities", label: "All capacities", short: "All" },
  { key: "overview", label: "Overview", short: "Overview" },
  { key: "anomalies", label: "Anomalies & root cause", short: "Anomalies" },
  { key: "throttling", label: "Throttling & headroom", short: "Throttling" },
  { key: "workspaces", label: "Workspaces & items", short: "Workspaces" },
  { key: "model-health", label: "Model health", short: "Models" },
  { key: "rebalance", label: "Rebalance", short: "Rebalance" },
  { key: "alerts-settings", label: "Alerts & settings", short: "Alerts" },
];

/** The two short ranges read 30-second points; the two long ones read the hourly roll-up. */
const LIVE_RANGES = [
  { label: "Last 2 hours", ms: 2 * 3_600_000 },
  { label: "Last 24 hours", ms: 24 * 3_600_000 },
  { label: "Last 7 days", ms: 7 * 24 * 3_600_000 },
  { label: "Last 14 days", ms: 14 * 24 * 3_600_000 },
];

/** For example "Asia/Calcutta (UTC+05:30)", so the data agent can give times the way the screens show them. */
function userTimeZone(): string {
  const offset = -new Date().getTimezoneOffset();
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const mm = String(Math.abs(offset) % 60).padStart(2, "0");
  let name = "";
  try { name = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""; } catch { /* no zone name available */ }
  return `${name ? `${name} ` : ""}(UTC${offset < 0 ? "-" : "+"}${hh}:${mm})`;
}
const SAMPLE_RANGES = ["Last 24 hours", "Last 2 hours", "Last 7 days", "Last 14 days"];
const LIVE_SUGGESTIONS = ["Will we throttle in the next hour?", "What is using the most CU right now?", "Explain smoothing in two sentences"];
const SAMPLE_CAPACITIES = ["cap-target-a · F64 · Central US", "cap-target-b · F64 · Central US", "All capacities"];

function routeFromHash(): ScreenKey {
  const key = window.location.hash.replace(/^#\/?/, "");
  return NAV.some((n) => n.key === key) ? (key as ScreenKey) : "overview";
}

type Theme = "auto" | "light" | "dark";
function readTheme(): Theme {
  try { const t = window.localStorage.getItem("ci-theme"); return t === "light" || t === "dark" ? t : "auto"; } catch { return "auto"; }
}
/** What "auto" resolves to: the host page's .dark class, else the OS setting. */
function autoIsDark(): boolean {
  if (document.documentElement.classList.contains("dark")) return true;
  if (document.documentElement.classList.contains("light")) return false;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readMode(): Mode {
  try { return window.localStorage.getItem("ci-mode") === "sample" ? "sample" : "live"; } catch { return "live"; }
}

interface Turn { id: number; question: string; answer?: string; error?: string; pending: boolean }

/** Renders agent text: blank-line paragraphs, "- " bullets, and **bold** markers removed. */
function AnswerText({ text }: { text: string }): ReactElement {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={blocks.length} style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>);
    bullets = [];
  };
  for (const raw of text.replace(/\*\*/g, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const m = /^[-*•]\s+(.*)$/.exec(line);
    if (m) { bullets.push(m[1]!); continue; }
    flush();
    blocks.push(<p key={blocks.length} style={{ margin: 0 }}>{line}</p>);
  }
  flush();
  return <>{blocks}</>;
}

export interface CapacityInsightsAppProps {
  source: CapacityDataSource;
  /** Shown under the product name, for example the workspace the app runs in. */
  subtitle?: string;
  /** Sends one question to the Fabric data agent and resolves to its answer. Without it the pane says it is not connected. */
  askAgent?: (question: string) => Promise<string>;
  /** Enables the guided "add a capacity" flow on All capacities. */
  onboarding?: OnboardingConfig;
}

/** The whole product UI: header, navigation, the current screen and the docked data agent. Both shells mount this. */
export function CapacityInsightsApp({ source, subtitle = "SE&I Customer Demos", askAgent, onboarding }: CapacityInsightsAppProps): ReactElement {
  const [screen, setScreen] = useState<ScreenKey>(routeFromHash);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [picked, setPicked] = useState<string>();
  const [rangeIdx, setRangeIdx] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [askError, setAskError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [capsKey, setCapsKey] = useState(0);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const dark = theme === "dark" || (theme === "auto" && autoIsDark());
  const toggleTheme = () => {
    const next: Theme = dark ? "light" : "dark";
    setTheme(next);
    try { window.localStorage.setItem("ci-theme", next); } catch { /* the choice then lasts for this visit */ }
  };

  useEffect(() => {
    const onHash = () => setScreen(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => setTurns([]), [screen, mode]);

  const setMode = (m: Mode) => {
    setModeState(m);
    try { window.localStorage.setItem("ci-mode", m); } catch { /* storage can be blocked; the choice then lasts for this visit */ }
  };

  const live = mode === "live";
  const caps = usePolling(() => source.listCapacities(), [source, refreshKey, capsKey], 5 * 60_000, live);
  const capacities = caps.data ?? [];
  const capacityId = picked ?? capacities[0]?.capacityId;
  const current = capacities.find((c) => c.capacityId === capacityId);
  const heartbeat = usePolling(
    () => (capacityId ? source.getLiveSummary(capacityId) : Promise.resolve(undefined)), [source, capacityId, refreshKey], 30_000, live);
  const range = LIVE_RANGES[rangeIdx] ?? LIVE_RANGES[0]!;
  const sample = sampleScreens.find((s) => s.key === screen) ?? sampleScreens[0]!;
  const title = NAV.find((n) => n.key === screen)?.label ?? "Overview";

  const liveAge = heartbeat.data ? Date.now() - new Date(heartbeat.data.asOf).getTime() : undefined;
  const liveOk = liveAge !== undefined && liveAge < 120_000;
  const context = live
    ? `Looking at: ${title}${current ? ` · ${shortName(current.displayName)}` : ""} · ${range.label.toLowerCase()}`
    : sample.agent.context;
  /** What the agent receives: the same context with the real capacity name and id, plus the user's time zone. */
  const agentContext = `Looking at: ${title}${current ? ` · capacity "${current.displayName}" (CapacityId ${current.capacityId})` : ""} · ${range.label.toLowerCase()}. User time zone: ${userTimeZone()}.`;

  const busy = turns.some((t) => t.pending);
  const chatRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Keep the newest question and answer in view, and start each screen at its top.
  useEffect(() => { const el = chatRef.current; if (el && turns.length > 0) el.scrollTop = el.scrollHeight; }, [turns]);
  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [screen, mode]);
  const ask = (question: string) => {
    const q = question.trim();
    if (!q) { setAskError(true); return; }
    if (busy) return;
    setAskError(false);
    setDraft("");
    const id = Date.now();
    if (!live) {
      setTurns((t) => [...t, { id, question: q, pending: false,
        answer: "This is sample data. In Live mode the data agent answers here from the same data as the screen." }]);
      return;
    }
    if (!askAgent) {
      setTurns((t) => [...t, { id, question: q, pending: false, error: "The data agent is not connected in this build." }]);
      return;
    }
    setTurns((t) => [...t, { id, question: q, pending: true }]);
    const settle = (patch: Partial<Turn>) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, pending: false, ...patch } : x)));
    askAgent(`${agentContext}\n${q}`).then(
      (answer) => settle({ answer }),
      (e: unknown) => settle({ error: e instanceof Error ? e.message : String(e) }),
    );
  };

  /** Links with href="#" do nothing; "Ask ..." buttons inside a screen send their topic to the data agent. */
  const onMainClick = (e: MouseEvent<HTMLElement>) => {
    const el = e.target as HTMLElement;
    const a = el.closest("a");
    if (a && a.getAttribute("href") === "#") { e.preventDefault(); return; }
    const b = el.closest("button");
    const text = b?.textContent?.trim() ?? "";
    // Buttons on the Live screens (.ci-linkbtn) send their own, more specific question.
    if (b && !b.classList.contains("ci-linkbtn") && /^ask\b/i.test(text)) {
      const heading = b.closest("section")?.querySelector("h2, strong, span")?.textContent?.trim();
      ask(heading && !/^ask\b/i.test(heading) ? `${text}: ${heading}` : text);
    }
  };

  const agentOn = !live || Boolean(askAgent);
  const suggestions = live ? LIVE_SUGGESTIONS : sample.agent.suggestions;

  return (
    <div className="ci-root" data-theme={theme === "auto" ? undefined : theme}>
      <header className="ci-header">
        <div className="ci-brand">
          <span className="ci-logo"><LogoIcon /></span>
          <span className="ci-brand-name">Capacity Insights</span>
          <span className="ci-brand-sep" aria-hidden="true" />
          <span className="ci-brand-sub">{subtitle}</span>
          <span className="ci-tag">{live ? "Live" : "Sample"}</span>
        </div>
        {screen !== "all-capacities" ? (
          <div className="ci-field">
            <label htmlFor="ci-capacity">Capacity</label>
            {live ? (
              <select key="live" id="ci-capacity" className="ci-select" value={capacityId ?? ""} onChange={(e) => setPicked(e.target.value)} disabled={capacities.length === 0}>
                {capacities.length === 0 ? <option value="">{caps.loading ? "Loading..." : "No capacity yet"}</option> : null}
                {capacities.map((c) => <option key={c.capacityId} value={c.capacityId} title={c.displayName}>{shortName(c.displayName)} · {c.sku} · {c.region}</option>)}
              </select>
            ) : (
              <select key="sample" id="ci-capacity" className="ci-select">{SAMPLE_CAPACITIES.map((c) => <option key={c}>{c}</option>)}</select>
            )}
          </div>
        ) : null}
        <div className="ci-field">
          <label htmlFor="ci-range">Time range</label>
          {live ? (
            <select key="live" id="ci-range" className="ci-select" value={rangeIdx} onChange={(e) => setRangeIdx(Number(e.target.value))}>
              {LIVE_RANGES.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
            </select>
          ) : (
            <select key="sample" id="ci-range" className="ci-select">{SAMPLE_RANGES.map((r) => <option key={r}>{r}</option>)}</select>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {live ? (
            <span className={`ci-pill ${liveOk ? "ok" : heartbeat.data ? "warn" : ""}`}>
              <span className="ci-dot" />
              {heartbeat.data ? `${liveOk ? "Live" : "Stale"} · ${ago(heartbeat.data.asOf)}` : heartbeat.error ? "No connection" : "Connecting"}
            </span>
          ) : <span className="ci-pill">Sample data</span>}
          <div className="ci-seg" role="group" aria-label="Data shown">
            <button type="button" aria-pressed={live} onClick={() => setMode("live")}>Live</button>
            <button type="button" aria-pressed={!live} onClick={() => setMode("sample")}>Sample</button>
          </div>
          <button type="button" className="ci-iconbtn" aria-label="Refresh" onClick={() => setRefreshKey((k) => k + 1)}><RefreshIcon /></button>
        </div>
      </header>

      <div className="ci-body">
        <nav className="ci-nav" aria-label="Capacity Insights">
          {NAV.map((n, i) => (
            <div key={n.key} style={{ display: "contents" }}>
              <a href={`#/${n.key}`} aria-current={screen === n.key ? "page" : undefined} title={n.label}>{navIcons[n.key]}<span>{n.short}</span></a>
              {i === 0 ? <div className="ci-nav-rule" /> : null}
            </div>
          ))}
          <div className="ci-nav-grow" />
          <button type="button" className="ci-nav-btn" onClick={toggleTheme} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
            {dark ? <SunIcon /> : <MoonIcon />}<span>{dark ? "Light" : "Dark"}</span>
          </button>
        </nav>

        <main className="ci-main" ref={mainRef} onClick={onMainClick}>
          <div className="ci-eyebrow"><span>Capacity Insights</span><span aria-hidden="true">›</span><b>{title}</b></div>
          {live ? (
            <>
              {caps.error ? <div className="ci-error" role="alert">Could not load capacities: {caps.error.message}</div> : null}
              <LiveScreen key={`${screen}-${refreshKey}`} screen={screen} source={source} capacities={capacities} capacityId={capacityId}
                rangeMs={range.ms} rangeLabel={range.label} onAsk={ask}
                onboarding={onboarding} onCapacitiesChanged={() => setCapsKey((k) => k + 1)}
                onOpen={(next, id) => { if (id) setPicked(id); window.location.hash = `#/${next}`; }} />
            </>
          ) : <sample.Main />}
        </main>

        <aside className="ci-agent" aria-label="Data agent">
          <div className="ci-agent-head">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="ci-agent-icon"><SparkIcon /></span>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>Ask Capacity Insights</span>
                <span style={{ fontSize: 12, color: "var(--ci-muted)" }}>Your capacity data, in conversation</span>
              </div>
            </div>
            <div className="ci-agent-status">
              <span className={`ci-dot ${agentOn ? "on" : ""}`} />
              {!live ? "Sample conversation" : askAgent ? "Connected to ci-data-agent" : "Data agent not connected"}
            </div>
          </div>
          <div className="ci-agent-body" ref={chatRef}>
            {live && turns.length === 0 ? (
              <div className="ci-agent-welcome">
                <div className="ci-eyebrow"><b>Fabric data agent</b></div>
                <h2>Ask why, not just what.</h2>
                <p>Question a spike, check the throttling risk, or find the models worth fixing first.</p>
              </div>
            ) : null}
            <div className="ci-agent-ctx">{context}</div>
            {!live ? (
              <>
                <div className="ci-agent-q">{sample.agent.question}</div>
                <div className="ci-agent-a" onClick={onMainClick}><sample.agent.Answer /></div>
              </>
            ) : null}
            {turns.map((t) => (
              <div key={t.id} style={{ display: "contents" }}>
                <div className="ci-agent-q">{t.question}</div>
                <div className="ci-agent-a" aria-live="polite">
                  {t.pending ? <p style={{ margin: 0, color: "var(--ci-muted)" }}>Asking the data agent. This can take up to a minute.</p> : null}
                  {t.error ? <div className="ci-error" role="alert">The data agent could not answer: {t.error}</div> : null}
                  {t.answer ? <AnswerText text={t.answer} /> : null}
                </div>
              </div>
            ))}
            <div className="ci-agent-sugg">
              <div className="ci-eyebrow"><span>Suggested for this page</span></div>
              {suggestions.map((s) => (
                <button type="button" key={s} disabled={busy} onClick={() => ask(s)}><span>{s}</span><ArrowUpRightIcon /></button>
              ))}
            </div>
            <div className="ci-agent-note">
              <DatabaseIcon />
              <span>Grounded on ci-eventhouse. The screen, capacity and time range you are looking at are sent as context.</span>
            </div>
          </div>
          <form className="ci-agent-foot" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
            <div className="ci-agent-box">
              <label htmlFor="ci-ask" className="ci-sr">Ask about this capacity</label>
              <textarea id="ci-ask" rows={2} value={draft} placeholder={live ? "Ask about this capacity..." : sample.agent.placeholder}
                aria-invalid={askError}
                onChange={(e) => { setDraft(e.target.value); setAskError(false); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(draft); } }} />
              <div className="ci-agent-box-row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><SparkIcon />Fabric data agent</span>
                <button type="submit" className="ci-send" aria-label="Send question" disabled={busy}><SendIcon /></button>
              </div>
            </div>
            {askError ? <span role="alert" style={{ fontSize: 12, color: "var(--ci-danger)" }}>Enter a question first</span> : null}
            <span className="ci-agent-fine">Answers use the app owner's access to the data. AI can make mistakes, so check the numbers.</span>
          </form>
        </aside>
      </div>
    </div>
  );
}
