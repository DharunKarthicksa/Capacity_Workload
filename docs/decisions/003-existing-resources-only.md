# 003: Existing capacities and workspaces only

Status: **decided** 2026-11-19 (by the user). Supersedes the plan's capacity and workspace provisioning tasks.

## Decision

- No new capacities and no new workspaces will be provisioned for this project.
- Everything runs on the **F64 capacity** that the SE&I Customer Demos Workspace sits on, inside the folder `Capacity Workload` (the plan's `CapInsights-Dev`).
- That same F64 is also a **monitored capacity**. The monitor therefore shares a capacity with what it watches.
- The end product is an Extensibility Toolkit **workload** (Phases 4 and 5). The Rayfin app (Phases 1 to 3) is the proving ground.

## What this replaces in the plan

| Plan item | Now |
| --- | --- |
| 1.1 Provision `cap-monitor` (F2 or F4) | **Not needed.** The F64 hosts the monitoring items. |
| 1.1 Two same-region capacities `cap-target-a` / `cap-target-b` | **Not provisioned.** Observed capacities are the F64 plus any existing capacity we hold Contributor or higher on (needed to stream its events). |
| 1.5 Create `RB-Test-A` and `RB-Test-B` workspaces | **Not created.** There are no test workspaces to move. |
| 4.5 Clean-room test in a new workspace on `cap-monitor` | Needs a rethink: use an existing workspace or folder, or test in a customer tenant (Phase 5.3). Decide at Phase 4. |

## Consequences and mitigations

1. **Monitor shares the F64 it watches.** If the F64 throttles, the monitor can throttle with it. The F64 is large and the pipeline is light, so this is accepted as a known risk. Measure it (task 3.8, `docs/cost.md`) and keep the break-glass real-time dashboard as the fallback view (task 2.6).
2. **No safe way to test a real workspace move.** CLAUDE.md rule 5 allows moves only for `RB-Test-*` workspaces, and none will exist. Until a safe test workspace is agreed, `rebalance_executor` runs in **propose-and-audit mode only**: it reads approved moves, writes the would-be move to `MoveExecution` and `AuditLog`, and never calls `assignToCapacity`. Live execution stays disabled. Raise it at the Phase 3 gate.
3. **The rebalancer cannot be proven end to end.** Its optimizer is still unit-tested with fixtures, and the approve and audit flow can be demonstrated, but the Phase 3 gate line "one approved move executed on `RB-Test-*`" cannot be met as written. It needs a lead decision (change the gate, or provide a test workspace later).
4. **Load generation runs on the shared F64.** Task 1.7 is already deferred. When it is revisited, a CU burn on the F64 affects every other demo on it, so it needs an explicit go-ahead and a small, short run.
5. **Everything stays inside the `Capacity Workload` folder** and keeps the `ci-` prefix (CLAUDE.md rules 11 and 12 are unchanged).

## Observed capacity (decided 2026-11-19)

The Eventstream `ci-capacity-overview` observes the existing **Trial FTL64 capacity in Central US**
(`8c55b754-a1fe-49af-acbd-787ac7c9e2cd`, friendly name `Trial-20261028T063052Z-zJ-97UlFJUiSTXCsofG8Ew`), not the F64.
The user chose to keep it. More capacities can be added later as extra sources on the same Eventstream.

## Open questions

- Is the capacity ID `ce66fcc6-91b8-4a05-ac16-600a739d7b74` (what the workspace API reports) the F64? The capacity list for our identity shows one F64 named `fabricf64new` (`cedb67c2-a798-4ee4-879f-6eb1bc70ab10`) with a different ID. The user states the workspace is on the F64; record the capacity name from the workspace settings (License info) when convenient.
- Which existing capacities, besides the F64, will we observe, and do we hold Contributor or higher on them?
