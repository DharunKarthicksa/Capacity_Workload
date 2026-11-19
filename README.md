# Capacity Insights

Real-time monitoring, anomaly detection, semantic model BPA and approved workspace rebalancing for Microsoft Fabric capacities.

See `Capacity Insights · 5-phase delivery plan.md` for the full plan and `CLAUDE.md` for working rules.

## Layout

| Path | Purpose |
| --- | --- |
| `packages/ui/` | Shared React screens, charts, rebalancer optimizer, `CapacityDataSource` interface |
| `apps/rayfin/` | Fabric App shell (Phase 3) |
| `apps/workload/` | Extensibility Toolkit workload shell (Phase 4) |
| `fabric/` | Fabric item definitions: eventstream, KQL scripts, semantic model (TMDL), notebooks, activator, real-time dashboard |
| `infra/` | Bicep for workload hosting (Phase 4) |
| `scripts/` | `fab` / `rayfin` wrappers, one per phase step |
| `docs/` | Architecture, decisions, publishing matrix, latency and cost measurements |

## Status

Phase 1 (prerequisites and foundation) in progress. See `docs/phase-1-checklist.md`.
