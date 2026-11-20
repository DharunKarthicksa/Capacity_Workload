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

## Try it in your own workspace

See [docs/deploy-to-another-workspace.md](docs/deploy-to-another-workspace.md). In short: import `fabric/installer/CapacityInsights_Install.ipynb` into a Fabric workspace and select Run all for the data items, then follow the same page to deploy the app.

## Status

Phases 1 to 3 are built: the data plane, the Fabric App with eight screens, and the data agent. Phase 4 (workload) has not started.
