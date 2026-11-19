# Capacity Insights

Real-time Fabric capacity monitor: live CU, anomaly scoring, semantic model BPA, and human-approved workspace rebalancing.
Delivery plan: `Capacity Insights · 5-phase delivery plan.md` (read it before starting any task).

## Architecture in one paragraph

Capacity overview events -> Eventstream -> Eventhouse (KQL, anomaly update policy) -> DirectQuery semantic model -> app.
The UI is one shared React package (`packages/ui`) behind the `CapacityDataSource` interface, with two thin shells:
`apps/rayfin` (Fabric App, Phases 1-3) and `apps/workload` (Extensibility Toolkit workload, Phases 4-5).
A Fabric App cannot be listed on the Workload Hub, which is why there are two shells.

## Target environment

- Build location: folder `Capacity Workload` (the plan calls it `CapInsights-Dev`) inside the **SE&I Customer Demos Workspace**, workspace ID `415f790e-a590-4b59-b30a-c3a70a48de1e`.
- Folder API ID: `b556fb13-1994-4e86-9efc-8039e4b6ed11`. When creating items via REST, pass it as `folderId`. Details in `docs/environment.md`.
- Every item we create is prefixed `ci-`.
- **Existing resources only** (decision `docs/decisions/003-existing-resources-only.md`): no new capacities and no new workspaces. Everything runs on the F64 that the SE&I workspace sits on, and that F64 is also monitored. Do not propose or create capacities, workspaces or `RB-Test-*` workspaces.
- Because no `RB-Test-*` workspace exists, `rebalance_executor` is propose-and-audit only: it never calls `assignToCapacity` (rule 5).
- The end product is an Extensibility Toolkit workload (Phases 4-5); the Rayfin app is the proving ground.

## Rules

1. Work from GitHub issues. Every change links an issue. UI changes come only from `ui-fix` issues, and only the human closes them.
2. Tasks labeled `you` are manual. Do not attempt them through any API, script or browser automation. Stop, print the step, and wait.
3. Run `--help` on any `fab` or `rayfin` command before its first use and record the exact flags in `scripts/`. Never guess a flag.
4. Use `-f` on `fab import` and `fab export` in scripts. Ask before any `fab rm` or item deletion.
5. Never call `assignToCapacity` from the app, a script or an interactive session. Only `rebalance_executor` calls it, only for rows in `MoveApproval`, and only for `RB-Test-*` workspaces until the Phase 3 gate is signed.
6. Never put secrets, keys or tokens in frontend code, `rayfin.yml` or the repo. Fabric Apps assets are served to users regardless of settings.
7. Rayfin schema changes go through code and `npx rayfin up db apply`, never by editing the SQL database.
8. KQL scripts are idempotent (`.create-or-alter`) and applied in file order.
9. After every deploy, comment on the tracking issue with the URL and what changed.
10. If a Learn page contradicts the plan, stop and flag it on the issue rather than working around it.
11. The SE&I Customer Demos Workspace (`415f790e-a590-4b59-b30a-c3a70a48de1e`) is shared. Create, change and delete only items inside our folder whose names start with `ci-`. Never touch any other item there.
12. Never change the SE&I workspace's settings: capacity assignment, roles, workspace monitoring, Log Analytics, Git connection. Each affects every demo in it. Raise it as a `you` issue instead.

## Session conventions

- Read-only first: `fab ls` and `fab get` before any change.
- Authentication is done by the user (`fab auth login`, `gh auth login`, `az login`). Claude may only run `fab auth status` to confirm.
- Never print or store tokens. `fab auth status` masks them; do not echo them elsewhere.
- Do not commit or push unless asked.
- Branches and commits follow `docs/branching.md`: short-lived branches off `main`, Conventional Commits, squash-merged PRs. Never commit directly to `main` after the initial scaffold.
