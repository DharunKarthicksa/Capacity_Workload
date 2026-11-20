/**
 * Guided "add a capacity to monitoring" (option 3 of the onboarding plan).
 *
 * The app cannot add an Eventstream source itself yet, so it does everything around that step:
 * it lists the capacities that are not monitored, gives the exact steps with a link to the Eventstream,
 * and watches for the first event so the user knows it worked.
 */
import { useEffect, useState, type ReactElement } from "react";
import type { CapacityDataSource, CapacityRef } from "../../data/CapacityDataSource";
import { usePolling } from "../../hooks/usePolling";

/** A capacity the current identity can administer or contribute to, whether or not it is monitored. */
export interface AccessibleCapacity {
  id: string;
  displayName: string;
  sku: string;
  region: string;
  /** "Active" or "Inactive" (paused capacities send no events). */
  state: string;
}

export interface OnboardingConfig {
  /** Lists the capacities this identity can access. In the Fabric App that is the app owner; in the workload, the signed-in user. */
  listAccessibleCapacities: () => Promise<AccessibleCapacity[]>;
  /** Opens the Eventstream that feeds the Eventhouse, in the Fabric portal. */
  eventstreamUrl: string;
  eventstreamName: string;
  /** Whose capacities the list shows, for the caption: for example "the app owner" or "you". */
  listedFor: string;
}

/** Trial capacities get a long generated name (Trial-<yyyymmdd>T...); show "Trial · 28 Oct" instead. */
export function shortName(name: string): string {
  const m = /^Trial-(\d{4})(\d{2})(\d{2})T\d{6}Z-/.exec(name);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return `Trial · ${d.toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" })}`;
  }
  return name.length > 32 ? `${name.slice(0, 30)}…` : name;
}

/** Per-user (PPU) capacities are not Fabric capacities and are left out. */
function monitorable(c: AccessibleCapacity): boolean {
  return !/^PP/i.test(c.sku);
}

function CopyButton({ value, label }: { value: string; label: string }): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => undefined);
  };
  return <button type="button" className="ci-linkbtn" onClick={copy} aria-label={`Copy ${label}`}>{copied ? "Copied" : "Copy"}</button>;
}

function Steps({ capacity, config, connected, onClose }: {
  capacity: AccessibleCapacity; config: OnboardingConfig; connected: boolean; onClose: () => void;
}): ReactElement {
  const [startedAt] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  const waited = Math.round((Date.now() - startedAt) / 60_000);

  return (
    <section className="ci-card" aria-label={`Add ${capacity.displayName} to monitoring`}>
      <div className="ci-row" style={{ alignItems: "flex-start" }}>
        <div>
          <h2>Add {shortName(capacity.displayName)} to monitoring</h2>
          <span className="ci-kpi-sub">{capacity.sku} · {capacity.region} · takes about 2 minutes, done once per capacity</span>
        </div>
        <button type="button" className="ci-linkbtn" onClick={onClose}>Close</button>
      </div>

      <div className="ci-nodata" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="ci-row"><span>Capacity name</span><span><strong style={{ overflowWrap: "anywhere" }}>{capacity.displayName}</strong> <CopyButton value={capacity.displayName} label="capacity name" /></span></div>
        <div className="ci-row"><span>Capacity ID</span><span><code>{capacity.id}</code> <CopyButton value={capacity.id} label="capacity ID" /></span></div>
      </div>

      <ol className="ci-steps">
        <li>
          <strong>Open the Eventstream.</strong> <a href={config.eventstreamUrl} target="_blank" rel="noreferrer">Open {config.eventstreamName} in Fabric</a>, then select <b>Edit</b>.
        </li>
        <li>
          <strong>Add the overview source.</strong> Select <b>Add source</b>, choose <b>Fabric capacity overview events</b>, pick the capacity named above, and keep every event type selected.
        </li>
        <li>
          <strong>Add the operation source.</strong> Select <b>Add source</b> again, choose <b>Fabric capacity operation events</b>, and pick the same capacity. This is what gives per-workspace and per-item detail.
        </li>
        <li>
          <strong>Connect and publish.</strong> Join both new sources to the existing stream, then select <b>Publish</b>.
        </li>
        <li>
          <strong>Come back here.</strong> This page checks every 30 seconds and tells you when the first event arrives.
        </li>
      </ol>

      {connected ? (
        <div className="ci-banner ok" role="status"><strong>Connected.</strong><span>Events from this capacity are arriving. It is now in the capacity picker.</span></div>
      ) : (
        <div className="ci-banner" role="status">
          <span className="ci-pulse" aria-hidden="true" />
          <span>Waiting for the first event from this capacity{waited >= 1 ? ` (${waited} min so far)` : ""}. Events normally start within 2 minutes of publishing.</span>
        </div>
      )}
      <span className="ci-kpi-sub">
        You need to be an admin of the capacity to add it as a source. Menu names in Fabric can differ slightly.
        {capacity.state !== "Active" ? " This capacity is paused, and a paused capacity sends no events until it is resumed." : ""}
      </span>
    </section>
  );
}

/** "Not monitored yet" list with the guided steps. `monitored` is what the pipeline already receives events from. */
export function AddCapacity({ config, monitored, source, onConnected }: {
  config: OnboardingConfig; monitored: CapacityRef[];
  /** Used to re-check every 30 seconds for the first event while the steps are open. */
  source: CapacityDataSource;
  /** Called once when a capacity that was being added starts sending events. */
  onConnected?: () => void;
}): ReactElement {
  const all = usePolling(() => config.listAccessibleCapacities(), [config], 5 * 60_000);
  const [openId, setOpenId] = useState<string>();
  const watch = usePolling(() => source.listCapacities(), [source], 30_000, openId !== undefined);
  const have = new Set([...monitored, ...(watch.data ?? [])].map((c) => c.capacityId.toLowerCase()));
  const openConnected = openId !== undefined && have.has(openId.toLowerCase());
  useEffect(() => { if (openConnected) onConnected?.(); }, [openConnected]); // eslint-disable-line react-hooks/exhaustive-deps
  const candidates = (all.data ?? []).filter(monitorable);
  const missing = candidates.filter((c) => !have.has(c.id.toLowerCase()));
  const open = candidates.find((c) => c.id === openId);

  return (
    <>
      <section className="ci-card" aria-label="Capacities not monitored yet">
        <div>
          <h2>Not monitored yet{all.data ? ` (${missing.length})` : ""}</h2>
          <span className="ci-kpi-sub">Capacities {config.listedFor} can administer that send no events to this app yet</span>
        </div>
        {all.error ? <div className="ci-error" role="alert">Could not list capacities: {all.error.message}</div> : null}
        {!all.data && all.loading ? <div className="ci-empty">Looking up capacities...</div> : null}
        {all.data && missing.length === 0 ? <div className="ci-empty">Every capacity {config.listedFor} can administer is monitored.</div> : null}
        {missing.length > 0 ? (
          <div className="ci-table-wrap">
            <table className="ci-table">
              <thead><tr><th>Capacity</th><th>SKU</th><th>Region</th><th>State</th><th><span className="ci-sr">Actions</span></th></tr></thead>
              <tbody>
                {missing.map((c) => (
                  <tr key={c.id} aria-selected={openId === c.id}>
                    <td title={c.displayName}><strong>{shortName(c.displayName)}</strong></td>
                    <td>{c.sku}</td><td>{c.region}</td>
                    <td><span className={`ci-pill ${c.state === "Active" ? "ok" : "warn"}`}>{c.state === "Active" ? "Active" : "Paused"}</span></td>
                    <td><button type="button" className="ci-linkbtn" onClick={() => setOpenId(openId === c.id ? undefined : c.id)}>{openId === c.id ? "Hide steps" : "Add to monitoring ›"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {open ? <Steps key={open.id} capacity={open} config={config} connected={have.has(open.id.toLowerCase())} onClose={() => setOpenId(undefined)} /> : null}
    </>
  );
}
