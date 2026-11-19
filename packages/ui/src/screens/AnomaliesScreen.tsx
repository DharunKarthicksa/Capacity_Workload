import type { ReactElement } from "react";
import type { CapacityDataSource } from "../data/CapacityDataSource";
import { usePolling } from "../hooks/usePolling";
import { Legend, LineChart } from "../components/LineChart";
import { ANOMALY_THRESHOLD } from "../data/dax";
import { REFRESH_MS } from "./LiveScreen";

const RANGE_MS = 24 * 3_600_000;

/** Anomalies view: scored points marked on the 24-hour series and a table of anomalies (score above 3). */
export function AnomaliesScreen({ source, capacityId }: { source: CapacityDataSource; capacityId: string }): ReactElement {
  const range = () => {
    const to = new Date();
    return { from: new Date(to.getTime() - RANGE_MS).toISOString(), to: to.toISOString() };
  };
  const series = usePolling(() => source.getSeries(capacityId, range()), [capacityId, source], REFRESH_MS);
  const anomalies = usePolling(() => source.getAnomalies(capacityId, range()), [capacityId, source], REFRESH_MS);

  const pts = series.data ?? [];
  const times = pts.map((p) => new Date(p.timestamp).getTime());
  const marks = pts.flatMap((p, i) => ((p.anomalyScore ?? 0) > ANOMALY_THRESHOLD ? [i] : []));
  const scored = pts.filter((p) => p.anomalyScore !== undefined).length;
  const lines = [{ name: "CU %", color: "var(--ci-brand)", values: pts.map((p) => p.cuPercent) }];
  const list = anomalies.data ?? [];

  return (
    <section aria-label="Anomalies">
      {series.error ? <div className="ci-error" role="alert">Could not load the series: {series.error.message}</div> : null}
      {anomalies.error ? <div className="ci-error" role="alert">Could not load anomalies: {anomalies.error.message}</div> : null}

      <div className="ci-panel">
        <h2>Last 24 hours, anomalies marked</h2>
        <LineChart times={times} series={lines} marks={marks} />
        <Legend series={lines} />
        <div className="ci-muted" style={{ marginTop: 6 }}>
          {pts.length > 0 && scored === 0
            ? "No points are scored yet: the baseline needs more history before scores appear."
            : `${scored} of ${pts.length} points scored. A point is an anomaly when its score is above ${ANOMALY_THRESHOLD}.`}
        </div>
      </div>

      <div className="ci-panel">
        <h2>Anomalies ({list.length})</h2>
        {list.length === 0 ? (
          <div className="ci-empty">No anomalies in the last 24 hours</div>
        ) : (
          <table className="ci-table">
            <thead><tr><th>Detected</th><th>Score</th><th>CU %</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.anomalyId}>
                  <td>{new Date(a.detectedAt).toLocaleString()}</td>
                  <td>{a.score.toFixed(1)}</td>
                  <td>{a.cuPercent.toFixed(2)}</td>
                  <td><span className={`ci-badge ${a.open ? "warn" : ""}`}>{a.open ? "Open" : "Past"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
