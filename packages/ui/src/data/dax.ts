/**
 * DAX implementation of CapacityDataSource over ci-semantic-model.
 *
 * It depends only on a `DaxExecutor`, so each shell supplies its own transport:
 *  - apps/rayfin   : the Rayfin semantic model connector (executeQuery)
 *  - apps/workload : the Power BI executeQueries REST call, with the signed-in user's token
 *
 * Model tables and columns are defined in scripts/deploy-semantic-model.ps1.
 * DAX returns UTC timestamps without a zone; they are normalised to ISO strings with a Z.
 */
import type {
  Anomaly, BpaFinding, BpaSeverity, CapacityDataSource, CapacityRef, LiveSummary,
  SeriesPoint, ThrottlingState, TimeRange, WorkspaceRollup,
} from "./CapacityDataSource";

export type DaxRow = Record<string, unknown>;
/** Runs one DAX query and returns rows keyed by bare column name (CapacitySummary[CuPercent] becomes CuPercent). */
export type DaxExecutor = (dax: string) => Promise<DaxRow[]>;

export const ANOMALY_THRESHOLD = 3;
/** Ranges longer than this are served as hourly points instead of 30-second points. */
export const HOURLY_ABOVE_MS = 26 * 3_600_000;

/** Strip Table[Column] or [Name] down to the bracketed name. */
export function bareName(column: string): string {
  const m = /\[([^\]]+)\]$/.exec(column);
  return m ? m[1]! : column;
}

/** Turn a connector table (columns plus row arrays) into keyed rows. */
export function rowsFromTable(columns: readonly { name: string }[], rows: readonly (readonly unknown[])[]): DaxRow[] {
  const names = columns.map((c) => bareName(c.name));
  return rows.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])));
}

const GUID = /^[0-9a-fA-F-]{8,64}$/;
function guid(id: string): string {
  if (!GUID.test(id)) throw new Error(`Invalid capacity id: ${id}`);
  return id.toLowerCase();
}

function dateLiteral(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid timestamp: ${iso}`);
  return `(DATE(${d.getUTCFullYear()},${d.getUTCMonth() + 1},${d.getUTCDate()}) + TIME(${d.getUTCHours()},${d.getUTCMinutes()},${d.getUTCSeconds()}))`;
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function optNum(v: unknown): number | undefined {
  return v === null || v === undefined || v === "" ? undefined : num(v);
}

/** No State events have arrived yet, so throttling is derived from overage only. */
function throttlingFrom(overageCuMs: number): ThrottlingState {
  return overageCuMs > 0 ? "Overage" : "None";
}

export function createDaxDataSource(run: DaxExecutor): CapacityDataSource {
  return {
    async listCapacities(): Promise<CapacityRef[]> {
      const rows = await run(
        `EVALUATE SUMMARIZE(CapacitySummary, CapacitySummary[CapacityId], CapacitySummary[CapacityName], CapacitySummary[Sku], CapacitySummary[Region]) ORDER BY CapacitySummary[CapacityName]`,
      );
      return rows.map((r) => ({
        capacityId: String(r.CapacityId), displayName: String(r.CapacityName ?? r.CapacityId),
        sku: String(r.Sku ?? ""), region: String(r.Region ?? ""),
      }));
    },

    async getLiveSummary(capacityId: string): Promise<LiveSummary> {
      const id = guid(capacityId);
      const rows = await run(
        `EVALUATE TOPN(1, FILTER(CapacitySummary, CapacitySummary[CapacityId] = "${id}"), CapacitySummary[Timestamp], DESC)`,
      );
      const r = rows[0];
      if (!r) throw new Error("No data for this capacity yet");
      return {
        capacity: {
          capacityId: id, displayName: String(r.CapacityName ?? id), sku: String(r.Sku ?? ""), region: String(r.Region ?? ""),
        },
        asOf: iso(r.Timestamp),
        cuPercent: num(r.CuPercent),
        interactivePercent: num(r.InteractivePercent),
        backgroundPercent: num(r.BackgroundPercent),
        interactiveDelayThresholdPercent: num(r.InteractiveDelayThresholdPercent),
        interactiveRejectionThresholdPercent: optNum(r.InteractiveRejectionThresholdPercent),
        backgroundRejectionThresholdPercent: optNum(r.BackgroundRejectionThresholdPercent),
        throttling: throttlingFrom(num(r.OverageCuMs)),
      };
    },

    async getSeries(capacityId: string, range: TimeRange): Promise<SeriesPoint[]> {
      const id = guid(capacityId);
      const spanMs = new Date(range.to).getTime() - new Date(range.from).getTime();
      if (spanMs > HOURLY_ABOVE_MS) {
        // Long ranges read the hourly materialized view (CapacityHourly) instead of 30-second rows.
        const hourly = await run(
          `EVALUATE SELECTCOLUMNS(
             FILTER(CapacityHourly, CapacityHourly[CapacityId] = "${id}" && CapacityHourly[Hour] >= ${dateLiteral(range.from)} && CapacityHourly[Hour] <= ${dateLiteral(range.to)}),
             "Timestamp", CapacityHourly[Hour], "CuPercent", CapacityHourly[CuAvg], "CuMax", CapacityHourly[CuMax],
             "InteractivePercent", CapacityHourly[InteractiveAvg], "BackgroundPercent", CapacityHourly[BackgroundAvg],
             "AnomalyScore", CapacityHourly[AnomalyMax], "DelayWindow", CapacityHourly[DelayWindowMax],
             "RejectionWindow", CapacityHourly[RejectionWindowMax], "BackgroundRejectionWindow", CapacityHourly[BackgroundRejectionWindowMax])
           ORDER BY [Timestamp] ASC`,
        );
        return hourly.map((r) => ({
          timestamp: iso(r.Timestamp), cuPercent: num(r.CuPercent), cuMaxPercent: optNum(r.CuMax),
          interactivePercent: num(r.InteractivePercent), backgroundPercent: num(r.BackgroundPercent), anomalyScore: optNum(r.AnomalyScore),
          delayWindowPercent: optNum(r.DelayWindow), rejectionWindowPercent: optNum(r.RejectionWindow),
          backgroundRejectionWindowPercent: optNum(r.BackgroundRejectionWindow),
        }));
      }
      const rows = await run(
        `EVALUATE SELECTCOLUMNS(
           FILTER(CapacitySummary, CapacitySummary[CapacityId] = "${id}" && CapacitySummary[Timestamp] >= ${dateLiteral(range.from)} && CapacitySummary[Timestamp] <= ${dateLiteral(range.to)}),
           "Timestamp", CapacitySummary[Timestamp], "CuPercent", CapacitySummary[CuPercent],
           "InteractivePercent", CapacitySummary[InteractivePercent], "BackgroundPercent", CapacitySummary[BackgroundPercent],
           "AnomalyScore", CapacitySummary[AnomalyScore], "DelayWindow", CapacitySummary[InteractiveDelayThresholdPercent],
           "RejectionWindow", CapacitySummary[InteractiveRejectionThresholdPercent],
           "BackgroundRejectionWindow", CapacitySummary[BackgroundRejectionThresholdPercent])
         ORDER BY [Timestamp] ASC`,
      );
      return rows.map((r) => ({
        timestamp: iso(r.Timestamp), cuPercent: num(r.CuPercent), interactivePercent: num(r.InteractivePercent),
        backgroundPercent: num(r.BackgroundPercent), anomalyScore: optNum(r.AnomalyScore),
        delayWindowPercent: optNum(r.DelayWindow), rejectionWindowPercent: optNum(r.RejectionWindow),
        backgroundRejectionWindowPercent: optNum(r.BackgroundRejectionWindow),
      }));
    },

    async getAnomalies(capacityId: string, range: TimeRange): Promise<Anomaly[]> {
      const id = guid(capacityId);
      const rows = await run(
        `EVALUATE SELECTCOLUMNS(
           FILTER(CapacitySummary, CapacitySummary[CapacityId] = "${id}" && CapacitySummary[AnomalyScore] > ${ANOMALY_THRESHOLD}
                  && CapacitySummary[Timestamp] >= ${dateLiteral(range.from)} && CapacitySummary[Timestamp] <= ${dateLiteral(range.to)}),
           "Timestamp", CapacitySummary[Timestamp], "CuPercent", CapacitySummary[CuPercent], "AnomalyScore", CapacitySummary[AnomalyScore])
         ORDER BY [Timestamp] DESC`,
      );
      return rows.map((r) => ({
        anomalyId: `${id}|${iso(r.Timestamp)}`, capacityId: id, detectedAt: iso(r.Timestamp),
        score: num(r.AnomalyScore), cuPercent: num(r.CuPercent),
        // "Open" means scored within the last hour; there is no acknowledgement workflow yet.
        open: Date.now() - new Date(iso(r.Timestamp)).getTime() < 3_600_000,
      }));
    },

    async getWorkspaceRollups(_capacityId: string, _range: TimeRange): Promise<WorkspaceRollup[]> {
      // Phase 3.5: needs the p95 per workspace hour, which the materialized view does not expose yet.
      throw new Error("getWorkspaceRollups is not implemented yet (step 3.5)");
    },

    async getBpaFindings(): Promise<BpaFinding[]> {
      const rows = await run(
        `EVALUATE VAR latest = MAX(BpaFindings[ScannedAt])
         RETURN SELECTCOLUMNS(FILTER(BpaFindings, BpaFindings[ScannedAt] = latest),
           "ScannedAt", BpaFindings[ScannedAt], "WorkspaceId", BpaFindings[WorkspaceId], "ModelId", BpaFindings[ModelId],
           "Rule", BpaFindings[Rule], "Category", BpaFindings[Category], "Severity", BpaFindings[Severity],
           "ModelName", BpaFindings[ModelName], "WorkspaceName", BpaFindings[WorkspaceName], "Description", BpaFindings[Description])`,
      );
      return rows.map((r) => ({
        modelId: String(r.ModelId), workspaceId: String(r.WorkspaceId), rule: String(r.Rule), category: String(r.Category),
        severity: (["Info", "Warning", "Error"].includes(String(r.Severity)) ? r.Severity : "Info") as BpaSeverity,
        scannedAt: iso(r.ScannedAt),
        modelName: r.ModelName ? String(r.ModelName) : undefined,
        workspaceName: r.WorkspaceName ? String(r.WorkspaceName) : undefined,
        description: r.Description ? String(r.Description) : undefined,
      }));
    },
  };
}
