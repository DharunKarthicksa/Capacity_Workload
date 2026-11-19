import { createDaxDataSource, rowsFromTable, type CapacityDataSource, type DaxExecutor } from "@capinsights/ui";
import { querySemanticModel } from "@/hooks/use-semantic-model-query";
import { getRayfinClient } from "@/lib/rayfin-client";
import { SemanticModelQueryError } from "@/lib/semantic-model-errors";

/** Connector name registered in rayfin/rayfin.yml (npx rayfin connector add). */
export const MODEL_CONNECTOR = "ci-semantic-model";

/**
 * Runs DAX through the Rayfin semantic model connector, using the app-level query cache.
 * The 30 s refresh must see new rows, so the cache is bypassed (the result is still written).
 */
const runDax: DaxExecutor = async (dax) => {
    const result = await querySemanticModel(MODEL_CONNECTOR, dax, true);
    if (result.status === "error") throw new SemanticModelQueryError(result.error);
    return rowsFromTable(result.table.columns, result.table.rows);
};

export const capacitySource: CapacityDataSource = createDaxDataSource(runDax);

/**
 * Asks the Fabric data agent through the `askDataAgent` Rayfin function (rayfin/functions).
 * The function runs server-side with the app identity; answers can take up to a minute.
 */
export const askDataAgent = (question: string): Promise<string> =>
    getRayfinClient().functions.askDataAgent.invoke({ question }, { timeoutMs: 240_000 });
