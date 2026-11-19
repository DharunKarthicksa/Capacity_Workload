# Phase 1 checklist: what is yours, what is Claude Code's

Source: `Capacity Insights · 5-phase delivery plan.md`, Phase 1. Tick items here as they land; the GitHub issue board becomes the source of truth once `gh` is set up.

## [YOU] Needed before Claude Code can proceed

### Tooling and sign-in (unblocks 1.4 and 1.6)
- [ ] Approve installing GitHub CLI (`gh`), then run `gh auth login` in your own terminal.
- [ ] Run `az login` in your own terminal (needed from Phase 4).
- [ ] Confirm the `fab` sign-in identity is the one that should own this work (`fab auth status` currently shows an `@ilink-systems.com` account).

### Capacities and licenses (1.1)
- [ ] Confirm an F SKU capacity in a region where Fabric Apps is available (check the region availability page first).
- [x] ~~Provision `cap-monitor`~~ Not needed: the F64 hosts the monitoring items (decision 003).
- [x] ~~Provide `cap-target-a` and `cap-target-b`~~ Not provisioned: observe the F64 plus existing capacities (decision 003).
- [ ] Grant yourself Capacity Admin (or at least Contributor) on the F64 and on any other existing capacity we will observe (needed to stream its events).

### Tenant and capacity settings (1.2)
- [ ] Fabric Apps enabled for `sg-capinsights-dev`.
- [ ] Real-Time Intelligence items creatable by that group.
- [ ] XMLA endpoint at least Read on the F64 and any other observed capacity.
- [ ] If CI runs `fab` as a service principal: "Service principals can use Fabric APIs" for its group.
- [ ] If Ask AI is in scope: Copilot and data agent tenant settings.

### Identities (1.3)
- [ ] Entra groups `sg-capinsights-dev` and `sg-capinsights-approvers`.
- [ ] Optional: app registration and service principal `sp-capinsights-ci` (secret goes in a GitHub Actions secret only).

### Workspace (1.5)
- [ ] Confirm your role and Claude Code's identity on the SE&I workspace are Member or Admin.
- [ ] Confirm **App** appears under New item in that workspace.
- [ ] Tell other workspace users that `ci-` prefixed items are under active development.
- [x] `CapInsights-Dev` folder: the existing `Capacity Workload` folder is used.

### Repo (1.6)
- [ ] Decide GitHub org, repo name and visibility. Current remote: `DharunKarthicksa/Capacity_Workload`.

## [CC] Claude Code tasks

- [x] Local repo initialised, `origin` set, layout from Appendix A, `CLAUDE.md` with Appendix B rules, `docs/` stubs.
- [x] Tooling versions recorded in `docs/tooling.md`.
- [ ] 1.4 Install `gh` (needs your approval), smoke test `fab ls` and `fab api capacities`.
- [x] 1.5 Resolve the `CapInsights-Dev` folder ID through the API and record it in `docs/environment.md` (folder `Capacity Workload`, `b556fb13-1994-4e86-9efc-8039e4b6ed11`).
- [x] 1.5 Record which capacity the SE&I workspace sits on (`ce66fcc6-91b8-4a05-ac16-600a739d7b74`, not visible to our identity; re-check once the monitored capacities exist).
- [x] 1.5 ~~Create `RB-Test-A` and `RB-Test-B`~~ Not created: no new workspaces (decision 003). `rebalance_executor` is propose-and-audit only.
- [ ] 1.6 Create GitHub issues (one per plan task), labels `phase-1` to `phase-5`, `ui-fix`, `you`, `blocked`.
- [ ] 1.6 Add the two architecture SVGs under `docs/architecture/` (the plan's embedded visuals are not in the markdown file; supply them or ask Claude Code to redraw).
- [ ] 1.7 **Deferred** (decision 2026-11-19, no CU burn for now): write `fabric/notebooks/loadgen.ipynb`, import to both test workspaces, run it. Revisit before the Phase 2 anomaly test and the Phase 3 rebalancer test, which both need it.

## [GATE] Phase 1 exit

- [ ] `fab ls` shows the three workspaces on the intended capacities.
- [ ] `fab job run` on `loadgen` succeeds in both test workspaces. **Deferred with task 1.7**; sign off the rest of the gate without it only with the lead's agreement.
- [ ] Repo exists with `CLAUDE.md`, issue board and labels.
- [ ] App appears as an item type in `CapInsights-Dev`.
