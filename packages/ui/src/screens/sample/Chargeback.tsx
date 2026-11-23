// Hand-authored sample screen (not from the design generator). Registered in ./extra.ts so a
// regeneration of index.ts never clobbers it. Shows the Chargeback page with demo cost-centre data.
import type { ReactElement } from "react";
import type { SampleScreen } from "./types";
import { downloadCsv, usdFull } from "../../data/cost";

interface Row { centre: string; workspaces: number; cuShare: number; cost: number; budget: number }

const ROWS: Row[] = [
  { centre: "Sales Analytics", workspaces: 3, cuShare: 34, cost: 3920, budget: 4500 },
  { centre: "Finance", workspaces: 2, cuShare: 23, cost: 2650, budget: 2500 },
  { centre: "Data Engineering", workspaces: 4, cuShare: 21, cost: 2420, budget: 3400 },
  { centre: "Marketing", workspaces: 2, cuShare: 14, cost: 1610, budget: 2400 },
  { centre: "Shared platform", workspaces: 1, cuShare: 8, cost: 920, budget: 1400 },
];
const TOTAL = ROWS.reduce((s, r) => s + r.cost, 0);
const BUDGET = ROWS.reduce((s, r) => s + r.budget, 0);
const MONTHS = [
  { m: "Jul", v: 9800 }, { m: "Aug", v: 10200 }, { m: "Sep", v: 10950 }, { m: "Oct", v: 11380 }, { m: "Nov", v: TOTAL },
];
const maxMonth = Math.max(...MONTHS.map((x) => x.v));

function statusPill(cost: number, budget: number): ReactElement {
  const used = (cost / budget) * 100;
  const cls = used >= 100 ? "danger" : used >= 80 ? "warn" : "ok";
  const label = used >= 100 ? "Over" : used >= 80 ? "Near" : "On track";
  return <span className={`ci-pill ${cls}`}>{label} · {used.toFixed(0)}%</span>;
}

function Main(): ReactElement {
  const exportRows = () => downloadCsv("chargeback-sample.csv", [
    ["Cost centre", "Workspaces", "CU share %", "Est. cost USD", "Budget USD"],
    ...ROWS.map((r) => [r.centre, r.workspaces, r.cuShare, r.cost, r.budget]),
  ]);
  return (
    <>
      <div><h1 className="ci-h1">Chargeback</h1><p className="ci-sub">Estimated spend by cost centre · cap-target-a · F64 · Central US · November</p></div>
      <div className="ci-grid">
        <section className="ci-card">
          <div className="ci-kpi-head"><span className="ci-kpi-label">Est. cost this month</span></div>
          <span className="ci-kpi-value">{usdFull(TOTAL)}</span>
          <span className="ci-kpi-sub">F64 at list rate · {((TOTAL / BUDGET) * 100).toFixed(0)}% of budget</span>
        </section>
        <section className="ci-card">
          <div className="ci-kpi-head"><span className="ci-kpi-label">Monthly budget</span></div>
          <span className="ci-kpi-value">{usdFull(BUDGET)}</span>
          <span className="ci-kpi-sub">Across {ROWS.length} cost centres</span>
        </section>
        <section className="ci-card">
          <div className="ci-kpi-head"><span className="ci-kpi-label">Over budget</span></div>
          <span className="ci-kpi-value" style={{ color: "var(--ci-warn)" }}>{ROWS.filter((r) => r.cost > r.budget).length}</span>
          <span className="ci-kpi-sub">Cost centres above 100%</span>
        </section>
      </div>
      <section className="ci-card" aria-label="Cost by cost centre">
        <div className="ci-row" style={{ alignItems: "flex-start" }}>
          <div><h2>Cost by cost centre</h2><span className="ci-kpi-sub">Split by each team's CU share of the capacity</span></div>
          <button type="button" className="ci-btn" onClick={exportRows}>Export (CSV)</button>
        </div>
        <div className="ci-table-wrap">
          <table className="ci-table">
            <thead><tr><th>Cost centre</th><th>Workspaces</th><th>CU share</th><th>Est. cost</th><th>Budget</th><th>Status</th></tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.centre}>
                  <td><strong>{r.centre}</strong></td>
                  <td>{r.workspaces}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span>{r.cuShare}%</span>
                      <div className="ci-track" style={{ maxWidth: 90 }}><i style={{ width: `${Math.min(100, r.cuShare * 2)}%` }} /></div>
                    </div>
                  </td>
                  <td>{usdFull(r.cost)}</td>
                  <td>{usdFull(r.budget)}</td>
                  <td>{statusPill(r.cost, r.budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="ci-card" aria-label="Monthly spend">
        <div><h2>Monthly spend</h2><span className="ci-kpi-sub">Last 5 months, estimated at list rate</span></div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 120, marginTop: 8 }}>
          {MONTHS.map((x) => (
            <div key={x.m} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
              <div style={{ width: "100%", maxWidth: 44, height: `${(x.v / maxMonth) * 100}%`, minHeight: 4, background: "var(--ci-teal)", borderRadius: "6px 6px 0 0" }} />
              <span className="ci-kpi-sub">{x.m}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Answer(): ReactElement {
  return (
    <>
      <p style={{ margin: 0 }}>Finance is the one cost centre over budget this month — {usdFull(2650)} against a {usdFull(2500)} budget (106%).</p>
      <p style={{ margin: 0 }}>Its share rose after two paginated-report workspaces were added on the 6th. Sales Analytics is the largest user at 34% of CU but stays under budget.</p>
    </>
  );
}

export const chargeback: SampleScreen = {
  key: "chargeback",
  title: "Chargeback",
  Main,
  agent: {
    context: "Looking at: Chargeback · cap-target-a · November",
    question: "Which cost centre is over budget and why?",
    suggestions: ["Which team grew the most this month?", "Forecast next month's spend", "Export chargeback as CSV"],
    placeholder: "Ask about cost and budgets...",
    Answer,
  },
};
