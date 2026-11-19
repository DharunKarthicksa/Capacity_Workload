# Environment

## SE&I Customer Demos Workspace (shared, see CLAUDE.md rules 11 and 12)

- Workspace ID: `415f790e-a590-4b59-b30a-c3a70a48de1e`
- Portal link: https://app.fabric.microsoft.com/groups/415f790e-a590-4b59-b30a-c3a70a48de1e/list?experience=fabric-developer&subfolderId=186182
- Name: `SE&I Customer Demos Workspace`
- Hosting capacity ID: `ce66fcc6-91b8-4a05-ac16-600a739d7b74`. It does **not** appear in `fab api capacities` for the signed-in identity, so its name, SKU and region are unknown. It is not one of the capacities we monitor (those do not exist yet). Re-check when `cap-monitor`, `cap-target-a` and `cap-target-b` are provisioned.

## Folder `CapInsights-Dev` (plan alias)

The plan's `CapInsights-Dev` is the existing top-level folder **`Capacity Workload`** (confirmed with the user on 2026-11-19; no folder with the plan's name exists).

- Name: `Capacity Workload`
- API folder ID: `b556fb13-1994-4e86-9efc-8039e4b6ed11` (parent: none, top level)
- Contents on 2026-11-19: empty
- Item prefix: `ci-`
- Resolved with `fab api workspaces/415f790e-a590-4b59-b30a-c3a70a48de1e/folders`. When creating via REST, pass `folderId: b556fb13-1994-4e86-9efc-8039e4b6ed11`.
- Other folders in this workspace (for example `Capacity monitoring`, `Capacity watchdog app`) belong to other work. Never touch them.

## Capacities

| Name | Role | Region | SKU | Capacity ID |
| --- | --- | --- | --- | --- |
| `cap-monitor` | hosts monitoring workspace and app | _tbd_ | _tbd_ | _tbd_ |
| `cap-target-a` | observed | _tbd_ | _tbd_ | _tbd_ |
| `cap-target-b` | observed | _tbd_ | _tbd_ | _tbd_ |

## Test workspaces (rebalancer may only move these during development)

| Name | Capacity | Workspace ID |
| --- | --- | --- |
| `RB-Test-A` | `cap-target-a` | _tbd_ |
| `RB-Test-B` | `cap-target-b` | _tbd_ |

## Entra groups

- `sg-capinsights-dev` (builders)
- `sg-capinsights-approvers` (approve workspace moves)
