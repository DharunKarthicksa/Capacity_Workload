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

## Finding (2026-11-20): operation events are refused across regions

We never received an operation event. The cause is not missing activity: the operation source on `ci-capacity-overview` has been in a failed state since it was added. Its error, read from the Eventstream topology API:

> Cross-region is not supported for Microsoft.Fabric.CapacityOperationEvents. capacityRegion=centralus, subscriberRegion=westus

The monitored trial capacity is in Central US and the workspace that holds the Eventstream is in West US. Capacity overview events are delivered across regions; operation events are not.

Consequences:

- Per-workspace and per-item data (Workspaces & items, top workspaces, root cause, rebalancing) is only available when the monitoring workspace is in the same region as the capacity it watches.
- Monitoring capacities in several regions needs one Eventstream, in a workspace on a capacity in that region, per region. This matters for the workload's install design.
- `fabricf64new` is in West US, the same region as our workspace, so adding it should deliver operation events. Not tried yet.
- `fn_ParseOperation` is still unverified, because no operation event has arrived.

