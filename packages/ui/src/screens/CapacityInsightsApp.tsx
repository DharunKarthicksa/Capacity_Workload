import { useState, type ReactElement } from "react";
import type { CapacityDataSource } from "../data/CapacityDataSource";
import { usePolling } from "../hooks/usePolling";
import { LiveScreen } from "./LiveScreen";
import { AnomaliesScreen } from "./AnomaliesScreen";

type Tab = "live" | "anomalies";

/** The shared app: capacity picker plus screens. Both shells (Rayfin app, workload) mount this with their own data source. */
export function CapacityInsightsApp({ source }: { source: CapacityDataSource }): ReactElement {
  const [tab, setTab] = useState<Tab>("live");
  const [picked, setPicked] = useState<string>();
  const caps = usePolling(() => source.listCapacities(), [source], 5 * 60_000);

  const list = caps.data ?? [];
  const capacityId = picked ?? list[0]?.capacityId;

  return (
    <div className="ci-root">
      <header className="ci-header">
        <h1 className="ci-title">Capacity Insights</h1>
        <nav className="ci-tabs" aria-label="Screens">
          <button aria-current={tab === "live" ? "page" : undefined} onClick={() => setTab("live")}>Live</button>
          <button aria-current={tab === "anomalies" ? "page" : undefined} onClick={() => setTab("anomalies")}>Anomalies</button>
        </nav>
      </header>

      <div className="ci-toolbar">
        <label htmlFor="ci-capacity">Capacity</label>
        <select id="ci-capacity" className="ci-select" value={capacityId ?? ""} onChange={(e) => setPicked(e.target.value)} disabled={list.length === 0}>
          {list.map((c) => <option key={c.capacityId} value={c.capacityId}>{c.displayName} ({c.sku})</option>)}
        </select>
      </div>

      {caps.error ? <div className="ci-error" role="alert">Could not load capacities: {caps.error.message}</div> : null}
      {!capacityId && !caps.error ? <div className="ci-empty">{caps.loading ? "Loading capacities..." : "No capacity data yet"}</div> : null}

      {capacityId && tab === "live" ? <LiveScreen source={source} capacityId={capacityId} /> : null}
      {capacityId && tab === "anomalies" ? <AnomaliesScreen source={source} capacityId={capacityId} /> : null}
    </div>
  );
}
