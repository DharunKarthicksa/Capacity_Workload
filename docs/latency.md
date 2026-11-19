# Latency: event time to DAX result

Target (Phase 2 gate): p95 under 60 seconds from event time to a DAX result. If worse, stop and decide the read path with the lead before Phase 3.

## Measurement 1: 2026-11-19, ~12:45 UTC

Path: capacity Summary event -> Eventstream `ci-capacity-overview` -> Eventhouse `ci-eventhouse` (`RawCapacityEvents`, update policy -> `CapacitySummary`) -> DirectQuery semantic model `ci-semantic-model` -> DAX `executeQueries`.

| Hop | Result | Sample |
| --- | --- | --- |
| Event window end -> row ingested into `CapacitySummary` | p50 **28 s**, p95 **43 s**, max 47 s | 23 stream rows (last 12 minutes). Rows I backfilled by hand are excluded; they show an artificial lag. |
| Freshest row visible to a DAX query, age at query time | **32 to 51 s** (41, 51, 32, 43) | 4 consecutive queries, ~5 s apart |
| DAX query round trip | ~5.5 s, including `fab` CLI start-up | 5 runs; the server-side time is lower |

Result: within the 60 s target. The dominant cost is the Eventstream-to-Eventhouse batching (about 30 s), not the semantic model.

## Caveats

- Small sample, one capacity (the Trial FTL64, Central US), an idle capacity, and a single short window. Re-measure over 24 hours and under load (the `loadgen` task is deferred) before treating p95 as final.
- The window end timestamp is the event's `windowEndTime`, which is at most 30 s old when the event is emitted. Lag measured from the event's own `time` field would be smaller.
- DAX returns timestamps without a time zone (UTC values); convert before comparing with local time.
