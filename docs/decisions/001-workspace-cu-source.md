# 001: Source of per-workspace CU

Status: **decided 2026-11-19: option 1, Capacity operation events.** The source `FabricCapacityOperationEvents`
(event type `Microsoft.Fabric.CapacityOperationEvents.Operation`) was available in our tenant and is wired into
the `ci-capacity-overview` Eventstream next to the overview source. No Operation event had arrived yet when
this was written, so `fn_ParseOperation` is unverified; re-check against real rows (see `fabric/kql/02_update_policies.kql`).

## Question
Are Capacity operation events available in our tenant (Real-Time hub, Fabric events)? The rebalancer needs per-workspace CU.

## Options
1. Capacity operation events, if present (preferred).
2. Wait for availability.
3. Read the Capacity Metrics app semantic model. Unsupported; can break on any app update.

## Decision
_Pending._
