# Environment

## SE&I Customer Demos Workspace (shared, see CLAUDE.md rules 11 and 12)

- Workspace ID: `415f790e-a590-4b59-b30a-c3a70a48de1e`
- Portal link: https://app.fabric.microsoft.com/groups/415f790e-a590-4b59-b30a-c3a70a48de1e/list?experience=fabric-developer&subfolderId=186182
- Name: `SE&I Customer Demos Workspace`
- Hosting capacity: the **F64** (stated by the user). The workspace API reports its ID as `ce66fcc6-91b8-4a05-ac16-600a739d7b74`, which does not appear in `fab api capacities` for the signed-in identity, so name and region are not recorded yet. This F64 is also a monitored capacity (decision 003).

## Folder `CapInsights-Dev` (plan alias)

The plan's `CapInsights-Dev` is the existing top-level folder **`Capacity Workload`** (confirmed with the user on 2026-11-19; no folder with the plan's name exists).

- Name: `Capacity Workload`
- API folder ID: `b556fb13-1994-4e86-9efc-8039e4b6ed11` (parent: none, top level)
- Contents on 2026-11-19: empty
- Item prefix: `ci-`
- Resolved with `fab api workspaces/415f790e-a590-4b59-b30a-c3a70a48de1e/folders`. When creating via REST, pass `folderId: b556fb13-1994-4e86-9efc-8039e4b6ed11`.
- Other folders in this workspace (for example `Capacity monitoring`, `Capacity watchdog app`) belong to other work. Never touch them.

## Capacities (existing only; see decision 003)

No new capacities or workspaces are provisioned.

| Capacity | Role | Region | SKU | Capacity ID |
| --- | --- | --- | --- | --- |
| The F64 hosting the SE&I workspace | hosts all `ci-` items **and** is monitored | _tbd_ | F64 | `ce66fcc6-91b8-4a05-ac16-600a739d7b74` (as reported by the workspace API; see decision 003 open questions) |
| Other existing capacities we hold Contributor or higher on | observed only | _tbd_ | _tbd_ | _tbd_ |

The plan's `cap-monitor`, `cap-target-a` and `cap-target-b` are not provisioned.

## Test workspaces

None. `RB-Test-A` and `RB-Test-B` are not created, so `rebalance_executor` runs in propose-and-audit mode only (decision 003).

## Entra groups

- `sg-capinsights-dev` (builders)
- `sg-capinsights-approvers` (approve workspace moves)
