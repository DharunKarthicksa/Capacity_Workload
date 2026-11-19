# Environment

## SE&I Customer Demos Workspace (shared, see CLAUDE.md rules 11 and 12)

- Workspace ID: `415f790e-a590-4b59-b30a-c3a70a48de1e`
- Portal link: https://app.fabric.microsoft.com/groups/415f790e-a590-4b59-b30a-c3a70a48de1e/list?experience=fabric-developer&subfolderId=186182
- Hosting capacity: _to be recorded (task 1.5). Flag it if it is a capacity we monitor._

## Folder `CapInsights-Dev`

- Name: _to be confirmed_
- API folder ID: _to be resolved via `fab api workspaces/415f790e-a590-4b59-b30a-c3a70a48de1e/folders` (portal `subfolderId=186182` may differ)_
- Item prefix: `ci-`

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
