import { createDaxDataSource, rowsFromTable, type CapacityDataSource, type DaxExecutor, type OnboardingConfig } from "@capinsights/ui";
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

/** The Eventstream that feeds ci-eventhouse (ids are not secrets). New capacities are added to it as sources. */
const WORKSPACE_ID = "415f790e-a590-4b59-b30a-c3a70a48de1e";
const EVENTSTREAM_ID = "5eb5b1a1-cc6e-42c0-b246-053bb35e7539";

/**
 * Guided "add a capacity". The list comes from the `listMyCapacities` Rayfin function, which runs as the
 * app identity, so it shows the capacities the app owner can administer.
 */
export const onboarding: OnboardingConfig = {
    listAccessibleCapacities: () => getRayfinClient().functions.listMyCapacities.invoke(undefined, { timeoutMs: 60_000 }),
    eventstreamUrl: `https://app.fabric.microsoft.com/groups/${WORKSPACE_ID}/eventstreams/${EVENTSTREAM_ID}?experience=fabric-developer`,
    eventstreamName: "ci-capacity-overview",
    listedFor: "the app owner",
};
