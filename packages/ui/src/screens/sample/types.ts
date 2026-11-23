import type { ReactElement } from "react";

export type ScreenKey =
  | "all-capacities" | "overview" | "anomalies" | "throttling"
  | "workspaces" | "chargeback" | "model-health" | "rebalance" | "alerts-settings";

/** The sample data-agent conversation shown for a screen in Sample mode. */
export interface SampleAgent {
  context: string;
  question: string;
  suggestions: string[];
  placeholder: string;
  Answer: () => ReactElement;
}

/** One design screen rendered with the design's sample numbers. */
export interface SampleScreen {
  key: string;
  title: string;
  Main: () => ReactElement;
  agent: SampleAgent;
}
