import { CapacityInsightsApp } from "@capinsights/ui";
import { WORKSPACE_LABEL, askDataAgent, capacitySource, onboarding } from "@/data/rayfin-source";

/** Rayfin shell: all screens live in packages/ui; this file only supplies the data source. */
function App() {
    return <CapacityInsightsApp source={capacitySource} subtitle={WORKSPACE_LABEL} askAgent={askDataAgent} onboarding={onboarding} />;
}

export default App;
