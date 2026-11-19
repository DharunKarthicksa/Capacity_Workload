/**
 * Local UI preview without Fabric sign-in: http://localhost:5199/preview.html
 * Sample mode shows the design screens; Live mode runs against the synthetic source below.
 * This entry is not part of the production build (only index.html is built and deployed).
 */
import { createRoot } from "react-dom/client";
import { CapacityInsightsApp, type CapacityDataSource, type SeriesPoint } from "@capinsights/ui";
import "./global.css";
import "@capinsights/ui/styles.css";

const cap = { capacityId: "00000000-0000-0000-0000-000000000001", displayName: "preview-capacity", sku: "F64", region: "Central US" };

function point(t: number): SeriesPoint {
  const base = 40 + 25 * Math.sin(t / 3_600_000) + 6 * Math.sin(t / 240_000);
  const interactive = Math.max(0, base * 0.55);
  return { timestamp: new Date(t).toISOString(), cuPercent: base, interactivePercent: interactive, backgroundPercent: base - interactive,
    anomalyScore: base > 68 ? 3.6 : 0.4, delayWindowPercent: base * 0.9, rejectionWindowPercent: base * 0.5, backgroundRejectionWindowPercent: base * 0.2 };
}

const synthetic: CapacityDataSource = {
  listCapacities: async () => [cap],
  getLiveSummary: async () => {
    const p = point(Date.now() - 20_000);
    return { capacity: cap, asOf: p.timestamp, cuPercent: p.cuPercent, interactivePercent: p.interactivePercent,
      backgroundPercent: p.backgroundPercent, interactiveDelayThresholdPercent: p.cuPercent * 0.9,
      interactiveRejectionThresholdPercent: p.cuPercent * 0.5, backgroundRejectionThresholdPercent: p.cuPercent * 0.2, throttling: "None" };
  },
  getSeries: async (_id, range) => {
    const from = new Date(range.from).getTime(), to = new Date(range.to).getTime();
    const step = Math.max(30_000, Math.round((to - from) / 480));
    const out: SeriesPoint[] = [];
    for (let t = from; t <= to; t += step) out.push(point(t));
    return out;
  },
  getAnomalies: async (id) => [{ anomalyId: "a1", capacityId: id, detectedAt: new Date(Date.now() - 900_000).toISOString(), score: 3.6, cuPercent: 71, open: true }],
  getWorkspaceRollups: async () => [],
  getBpaFindings: async () => ["Performance", "DAX expressions", "Formatting"].flatMap((category, i) =>
    Array.from({ length: 6 - i * 2 }, (_, n) => ({
      modelId: `m${n % 3}`, modelName: `Preview model ${n % 3}`, workspaceId: "w1", workspaceName: "Preview workspace",
      rule: `${category} rule ${n % 2}`, category, severity: (n === 0 && i === 0 ? "Error" : n % 2 ? "Warning" : "Info") as "Error" | "Warning" | "Info",
      scannedAt: new Date(Date.now() - 3_600_000).toISOString(),
    }))),
};

const fakeAgent = (question: string): Promise<string> =>
  new Promise((resolve) => setTimeout(() => resolve(`Preview answer for: ${question.split(/\n/).pop()}

- First point with a number: 42%
- Second point
- Third point

A closing line.`), 1200));

createRoot(document.getElementById("root")!).render(
  <CapacityInsightsApp source={synthetic} subtitle="Local preview · synthetic data" askAgent={fakeAgent} />,
);
