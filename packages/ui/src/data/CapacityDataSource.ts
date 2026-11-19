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
  interactiveDelayThresholdPercent: number;
  throttling: ThrottlingState;
}

export interface SeriesPoint {
  timestamp: ISOTimestamp;
  cuPercent: number;
  interactivePercent: number;
  backgroundPercent: number;
  anomalyScore?: number;
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
}

export interface CapacityDataSource {
  listCapacities(): Promise<CapacityRef[]>;
  getLiveSummary(capacityId: string): Promise<LiveSummary>;
  getSeries(capacityId: string, range: TimeRange): Promise<SeriesPoint[]>;
  getAnomalies(capacityId: string, range: TimeRange): Promise<Anomaly[]>;
  getWorkspaceRollups(capacityId: string, range: TimeRange): Promise<WorkspaceRollup[]>;
  getBpaFindings(): Promise<BpaFinding[]>;
}
