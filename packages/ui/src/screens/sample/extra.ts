import type { SampleScreen } from "./types";
import { chargeback } from "./Chargeback";

/**
 * Sample screens added by hand, outside the design generator. The generator rewrites index.ts
 * from its fixed screen list, so new pages that are not in the original design live here instead.
 */
export const extraSampleScreens: SampleScreen[] = [chargeback];
