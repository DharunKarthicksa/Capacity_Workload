/**
 * Data-access contract shared by both shells.
 *  - apps/rayfin   implements it over the semantic model connector (executeQuery, DAX).
 *  - apps/workload implements it over the KQL query endpoint (fallback: DAX via executeQueries).
 *
 * Screens in this package depend only on this interface. Field names are a first draft
 * and will be aligned with the KQL schema (fabric/kql/01_tables.kql) in Phase 2.
 */

export type ISOTimestamp = string;

export interface CapacityRef {
  capacityId: string;
  displayName: string;
  sku: string;
  region: string;
}

export type ThrottlingState = "None" | "Overage" | "Throttled" | "Rejecting" | "Unknown";

export interface LiveSummary {
  capacity: CapacityRef;
  asOf: ISOTimestamp;
  cuPercent: number;
  interactivePercent: number;
  backgroundPercent: number;
  /** How full the 10-minute window is. Interactive jobs are delayed at 100. */
  interactiveDelayThresholdPercent: number;
  /** How full the 60-minute window is. Interactive jobs are rejected at 100. */
  interactiveRejectionThresholdPercent?: number;
  /** How full the 24-hour window is. All jobs are rejected at 100. */
  backgroundRejectionThresholdPercent?: number;
  throttling: ThrottlingState;
}

export interface SeriesPoint {
  timestamp: ISOTimestamp;
  /** CU %. For hourly points this is the hour's average. */
  cuPercent: number;
  /** Highest 30-second CU % in the hour. Only set on hourly points. */
  cuMaxPercent?: number;
  interactivePercent: number;
  backgroundPercent: number;
  anomalyScore?: number;
  delayWindowPercent?: number;
  rejectionWindowPercent?: number;
  backgroundRejectionWindowPercent?: number;
}


export interface TimeRange {
  from: ISOTimestamp;
  to: ISOTimestamp;
}

export interface Anomaly {
  anomalyId: string;
  capacityId: string;
  detectedAt: ISOTimestamp;
  score: number;
  cuPercent: number;
  open: boolean;
}

export interface WorkspaceRollup {
  workspaceId: string;
  workspaceName: string;
  capacityId: string;
  hour: ISOTimestamp;
  cuP95: number;
  cuPeak: number;
}

export type BpaSeverity = "Info" | "Warning" | "Error";

export interface BpaFinding {
  modelId: string;
  workspaceId: string;
  rule: string;
  category: string;
  severity: BpaSeverity;
  scannedAt: ISOTimestamp;
  modelName?: string;
  workspaceName?: string;
  /** Object and rule description, as written by the scan. */
  description?: string;
}

export interface CapacityDataSource {
  listCapacities(): Promise<CapacityRef[]>;
  getLiveSummary(capacityId: string): Promise<LiveSummary>;
  getSeries(capacityId: string, range: TimeRange): Promise<SeriesPoint[]>;
  getAnomalies(capacityId: string, range: TimeRange): Promise<Anomaly[]>;
  getWorkspaceRollups(capacityId: string, range: TimeRange): Promise<WorkspaceRollup[]>;
  getBpaFindings(): Promise<BpaFinding[]>;
}
