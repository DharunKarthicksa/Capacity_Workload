import { CapacityInsightsApp } from "@capinsights/ui";
import { capacitySource } from "@/data/rayfin-source";

/** Rayfin shell: all screens live in packages/ui; this file only supplies the data source. */
function App() {
    return <CapacityInsightsApp source={capacitySource} />;
}

export default App;
