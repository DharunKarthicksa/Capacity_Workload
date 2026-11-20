import { CapacityInsightsApp } from "@capinsights/ui";
import { askDataAgent, capacitySource, onboarding } from "@/data/rayfin-source";

/** Rayfin shell: all screens live in packages/ui; this file only supplies the data source. */
function App() {
    return <CapacityInsightsApp source={capacitySource} askAgent={askDataAgent} onboarding={onboarding} />;
}

export default App;
