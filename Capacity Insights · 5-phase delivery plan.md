# Capacity Insights · 5-phase delivery plan

Nov 19, 2026 · @Dharun Karthick S

## How to use this plan

We ship a Fabric App built with Rayfin in our own tenant first (Phases 1 to 3), then wrap the same UI as an Extensibility Toolkit workload, test it in our tenant and list it on the Workload Hub (Phases 4 and 5). Every task carries an owner tag, and every phase ends on a gate that both of us sign off.

**Owner tags**

- **\[CC\]** Claude Code runs it: `fab` (Fabric CLI), `npx rayfin`, `npm`, `git`, `gh`, `az`. It stops and prints the step when it hits a \[YOU\] task.
- **\[YOU\]** Manual, in the Fabric portal, admin portal, Entra or Partner Center. No scripted workaround is attempted for these.
- **\[GATE\]** Exit check for the phase. The next phase does not start until every gate line is true.

**The decision that shapes the plan: a Fabric App is not a Workload Hub listing.** A Fabric App is a workspace item that `npx rayfin up` deploys into a workspace ([Fabric Apps overview](https://learn.microsoft.com/en-us/fabric/apps/overview)). The Workload Hub lists Extensibility Toolkit workloads, registered under a permanent `[Publisher].[Workload]` ID and uploaded as a `.nupkg` ([publishing overview](https://learn.microsoft.com/fabric/extensibility-toolkit/publishing-overview)). I did not find anything on Learn that distributes a Fabric App through the Workload Hub. So the UI is built once as a shared React package behind a data-access interface, with two thin shells: `apps/rayfin` (the end product the team expects) and `apps/workload` (the Hub listing). Confirm this with the lead before Phase 4 starts.

**The second constraint: Fabric Apps have no Eventhouse connector.** Connectors cover the lakehouse SQL analytics endpoint, warehouse, SQL database in Fabric and semantic model ([Fabric Apps connectors](https://learn.microsoft.com/en-us/fabric/apps/connectors)). Live capacity data therefore reaches the app through a semantic model in DirectQuery over the KQL database, queried with `executeQuery` (DAX, delegated auth only). Phase 2 measures that latency before Phase 3 builds on it.

**Phase map** (durations are estimates for one developer plus Claude Code)

1. Prerequisites and foundation, 1 week
2. Data plane in Fabric, 2 weeks
3. Fabric App (Rayfin) in our tenant, 3 to 4 weeks, including the manual UI review loop
4. Package as a workload and test in our tenant, 3 weeks
5. Publish to the Workload Hub, 4 to 8 weeks, mostly Microsoft validation time

&#91;embedded content: roadmap · 5 phases, 5 gates\]

Phase 3 is highlighted because it delivers what the team expects; Phases 4 and 5 turn the same UI into the Workload Hub listing.

## Phase 1 · Prerequisites and foundation

Goal: every capacity, workspace, setting, identity and tool exists and both CLIs authenticate. No telemetry flows yet.

**1.1 Capacities and licenses**

- [ ] &#91;YOU\] Confirm a Fabric capacity (F SKU) in a region where Fabric Apps is available. Check the [region availability page](https://learn.microsoft.com/en-us/fabric/admin/region-availability) before buying anything.
- [ ] &#91;YOU\] Provision `cap-monitor`, a small capacity (F2 or F4) that hosts only the monitoring workspace and the app. The monitor must not share a capacity with what it watches, or it throttles exactly when you need it.
- [ ] &#91;YOU\] Make sure at least two workload capacities in the **same region** exist to observe: `cap-target-a` and `cap-target-b`. The rebalancer cannot be tested with one, and non-Power BI items cannot move across regions ([Assign To Capacity](https://learn.microsoft.com/rest/api/fabric/core/workspaces/assign-to-capacity)).
- [ ] &#91;YOU\] Grant yourself Capacity Admin, or at least Contributor, on all three. Streaming a capacity's events requires Contributor or higher on it ([capacity overview events source](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/event-streams/add-source-fabric-capacity-overview-events)).

**1.2 Tenant and capacity settings** (Fabric admin portal)

- [ ] &#91;YOU\] Tenant settings, Fabric Apps: Enabled for a security group `sg-capinsights-dev` (steps in the [Fabric Apps overview](https://learn.microsoft.com/en-us/fabric/apps/overview)).
- [ ] &#91;YOU\] Confirm Real-Time Intelligence items (Eventhouse, Eventstream, Activator) can be created by that group.
- [ ] &#91;YOU\] Capacity settings on `cap-target-a` and `cap-target-b`: XMLA endpoint at least Read, so the BPA notebook can read semantic models.
- [ ] &#91;YOU\] If Claude Code will run `fab` as a service principal in CI: enable "Service principals can use Fabric APIs" for a group holding that principal.
- [ ] &#91;YOU\] If Ask AI is in scope: the Copilot and data agent tenant settings for the same group.
- [ ] &#91;YOU\] Note now, act in Phase 4: the Extensibility Toolkit workload settings. They are not needed until then.

**1.3 Identities**

- [ ] &#91;YOU\] Create Entra groups `sg-capinsights-dev` (builders) and `sg-capinsights-approvers` (people allowed to approve workspace moves).
- [ ] &#91;YOU\] Optional: an Entra app registration plus service principal for CI (`sp-capinsights-ci`). Store its secret in a GitHub Actions secret, never in the repo.

**1.4 Tooling on the dev machine**

- [ ] &#91;CC\] Check and install: Node LTS, Python 3.10+, git, GitHub CLI, Azure CLI (Phase 4).
- [ ] &#91;CC\] `pip install ms-fabric-cli`, then `fab --version` and record the version in `docs/tooling.md`.
- [ ] &#91;YOU\] `fab auth login` (interactive browser sign-in). Also `gh auth login` and `az login`.
- [ ] &#91;CC\] Smoke test: `fab ls` and `fab api capacities` list the three capacities.

**1.5 Workspaces**

Build location: a folder in the existing **SE&I Customer Demos Workspace** ([portal link](https://app.fabric.microsoft.com/groups/415f790e-a590-4b59-b30a-c3a70a48de1e/list?experience=fabric-developer&subfolderId=186182)), workspace ID `415f790e-a590-4b59-b30a-c3a70a48de1e`. Claude Code and you both create items there. Wherever this plan says `CapInsights-Dev`, it means this folder.

- [ ] &#91;CC\] Resolve the folder through the API (`fab api workspaces/415f790e-a590-4b59-b30a-c3a70a48de1e/folders`). The `subfolderId=186182` in the portal URL may not be the ID the API expects, so match by folder name and record name and API ID in `docs/environment.md`.
- [ ] &#91;CC\] Record which capacity the workspace sits on (`fab api workspaces/415f790e-a590-4b59-b30a-c3a70a48de1e`). If it is one of the capacities we monitor, flag it on the issue: the monitor would then throttle with what it watches. Do not move the workspace.
- [ ] &#91;CC\] Create every item inside the folder. Check whether `fab mkdir` takes a folder; if not, create through `fab api` on the Create Item endpoint with the folder ID in the body.
- [ ] &#91;CC\] Prefix every item `ci-` (`ci-eventhouse`, `ci-loadgen`, `ci-semantic-model`) so our items are easy to tell from other demos in the workspace.
- [ ] &#91;CC\] Create `RB-Test-A` on `cap-target-a` and `RB-Test-B` on `cap-target-b` as separate workspaces. These are the only workspaces the rebalancer may move during development. The SE&I workspace is never a move candidate.
- [ ] &#91;YOU\] Confirm your role and Claude Code's sign-in identity on the SE&I workspace are Member or Admin (needed to create items, schedule jobs and share the app).
- [ ] &#91;YOU\] In the portal, confirm **App** appears in New item for the SE&I workspace. If it does not, the Fabric Apps tenant setting or the capacity's region is the blocker.
- [ ] &#91;YOU\] Tell the other users of the workspace that items prefixed `ci-` are under active development and will be created, changed and deleted often.

**1.6 Repo and working agreement**

- [ ] &#91;YOU\] Decide GitHub org, repo name and visibility.
- [ ] &#91;CC\] `gh repo create`, then push the layout from the appendix, `CLAUDE.md` with the rules from the appendix, the two architecture SVGs under `docs/`, and issue labels `phase-1` to `phase-5`, `ui-fix`, `you`, `blocked`.
- [ ] &#91;CC\] Open one GitHub issue per task in this plan, tagged with its phase and owner. Every \[YOU\] task gets the `you` label so it is visible on one board.

**1.7 Load generator** (needed to test anomalies and the rebalancer)

- [ ] &#91;CC\] Write `fabric/notebooks/loadgen.ipynb`: a parameterized Spark workload that burns a set amount of CU for N minutes.
- [ ] &#91;CC\] `fab import` it into `RB-Test-A` and `RB-Test-B`; trigger it with `fab job run ... -P minutes:int=10`.

**\[GATE\] Phase 1 exit**

- `fab ls` shows the three workspaces on the intended capacities.
- `fab job run` on `loadgen` succeeds in both test workspaces.
- The repo exists with `CLAUDE.md`, the issue board and the labels.
- App appears as an item type in `CapInsights-Dev`.

## Phase 2 · Data plane in Fabric

Goal: capacity telemetry lands every 30 seconds, gets scored, is queryable through a semantic model, and alerts fire. All of this is proven with KQL and DAX before any UI exists.

**2.1 Capacity overview events into an Eventstream**

- [ ] &#91;YOU\] In `CapInsights-Dev`: Real-Time hub, Fabric events, Capacity overview events, Create Eventstream. Select `cap-target-a` and both event types (Summary, State). Repeat the source for `cap-target-b` in the same Eventstream. Publish.
- [ ] &#91;CC\] `fab export` the Eventstream into `fabric/eventstream/`. Then test: `fab import` it into a scratch workspace and check whether the capacity source survives. The result decides whether Phase 4 onboarding can script this step or must show it as a manual step.

**2.2 Capacity operation events** (per-workspace CU, which the rebalancer needs)

- [ ] &#91;YOU\] Check Real-Time hub, Fabric events, for Capacity operation events in our tenant.
- [ ] &#91;CC\] If present: add it as a second source and export again. If absent: record the decision in `docs/decisions/001-workspace-cu-source.md`. Options are waiting for availability, or reading the Capacity Metrics app semantic model, which is unsupported and can break on any app update.

**2.3 Eventhouse and KQL schema**

- [ ] &#91;CC\] `fab mkdir` an Eventhouse `CapInsights` and KQL database `capinsights` in `CapInsights-Dev`. Route the Eventstream to table `RawCapacityEvents` (one dynamic column plus ingestion time).
- [ ] &#91;CC\] Write the schema as idempotent `.create-or-alter` scripts in `fabric/kql/`, applied in order:
  1. `01_tables.kql`: `CapacitySummary`, `CapacityState`, `CapacityOperation`, `AnomalyBaseline`, `BpaFindings`.
  2. `02_update_policies.kql`: parse `RawCapacityEvents` into the typed tables on ingest.
  3. `03_anomaly.kql`: an update policy that scores each Summary row as a z-score against `AnomalyBaseline` for the same capacity and hour of week, plus a query-time function `fn_anomaly_scan()` using `series_decompose_anomalies` for the deeper view.
  4. `04_views.kql`: materialized views for CU by workspace per 5 minutes and per hour, with p95 and peak.
  5. `05_policies.kql`: retention 30 days on raw, 400 days on typed tables and views.
- [ ] &#91;CC\] Apply the scripts. Try a KQL database definition import through `fab import` first; if the definition format does not take the schema, use a setup notebook that runs the scripts. Record which method works.
- [ ] &#91;CC\] `fabric/notebooks/baseline_refresh.ipynb` rebuilds `AnomalyBaseline` from the last 4 weeks. Schedule it hourly with `fab job run-sch`.

**2.4 DirectQuery semantic model** (the app's read path)

- [ ] &#91;CC\] Author `fabric/semantic-model/CapInsights.SemanticModel` in TMDL: DirectQuery tables over the KQL database for latest capacity state, the 30-second series for the last 24 hours, anomalies, workspace rollups and BPA findings. `fab import` into `CapInsights-Dev`.
- [ ] &#91;YOU\] If the import leaves the data source unauthenticated: set credentials or SSO on the model in the portal.
- [ ] &#91;CC\] Measure latency: run `loadgen`, then timestamp event time, ingestion time and the first DAX query that returns the row (DAX through `fab api -A powerbi` executeQueries). Write results to `docs/latency.md`.

**2.5 Semantic model BPA**

- [ ] &#91;CC\] `fabric/notebooks/bpa_scan.ipynb` using semantic-link-labs. Parameters: workspace list or "all I can see". Output rows to `BpaFindings` with model ID, workspace ID, rule, category, severity and scan time. Check the current semantic-link-labs API before writing it.
- [ ] &#91;CC\] `fab import`, `fab job run` once, then `fab job run-sch` daily.
- [ ] &#91;YOU\] Make sure the notebook's run identity has Build or higher on the models it scans.

**2.6 Alerts and the break-glass view**

- [ ] &#91;YOU\] Create Activator rules in the portal: State events with `interactiveDelayThresholdPercentage` above 95 per capacity, and anomaly score above 3 from `CapacitySummary`. Action: Teams message to `sg-capinsights-dev`.
- [ ] &#91;CC\] `fab export` the Activator into `fabric/activator/` if export is supported; otherwise document the rules in `docs/activator-rules.md`.
- [ ] &#91;CC\] Real-time dashboard `CapInsights-BreakGlass` over the KQL database, exported to `fabric/rtd/`. It is the fallback view if the app is unavailable.

**\[GATE\] Phase 2 exit**

- 24 hours of Summary rows for both capacities, no gap longer than 2 minutes.
- p95 latency from event time to a DAX result is measured. Target under 60 seconds; if it is worse, stop and decide the read path with the lead before Phase 3.
- A 10-minute `loadgen` spike produces an anomaly score above 3 within 2 minutes, and the Activator message arrives.
- `BpaFindings` holds rows from at least one real model.
- Decision 001 (workspace CU source) is recorded.

## Phase 3 · Fabric App (Rayfin) in our tenant

Goal: the team's end product runs as an App item in `CapInsights-Dev`, pilot users use it for a week, and one workspace move has gone end to end with an audit trail. You start reviewing the UI as soon as the first screen deploys (step 3.4), and that loop runs until the gate.

**3.1 Create and scaffold**

- [ ] &#91;YOU\] In `CapInsights-Dev`: New item, App, name `capinsights` ([create an app](https://learn.microsoft.com/en-us/fabric/apps/create-app)).
- [ ] &#91;CC\] `npm create @microsoft/rayfin@latest` into `apps/rayfin`, with the project name matching the item. Move all screens and charts into `packages/ui` so the Phase 4 shell reuses them.
- [ ] &#91;CC\] Define `packages/ui/src/data/CapacityDataSource.ts`, an interface with methods like `getLiveSummary`, `getSeries`, `getAnomalies`, `getWorkspaceRollups`, `getBpaFindings`. The Rayfin adapter implements it now; the workload adapter implements it in Phase 4.

**3.2 Connectors and the app's own state**

- [ ] &#91;CC\] `npx rayfin connector search` to find the semantic model, then `npx rayfin connector add --type fabric-semanticmodel ... --operations executeQuery`. Semantic models support delegated auth only, so each user needs Build on the model ([connectors](https://learn.microsoft.com/en-us/fabric/apps/connectors)).
- [ ] &#91;CC\] Rayfin entities in the app's SQL database: `AppConfig` (monitored capacity IDs, thresholds), `MoveProposal`, `MoveApproval`, `MoveExecution`, `AuditLog`. Restrict approve and execute writes with `@role` to `sg-capinsights-approvers` (verify how group claims surface in Rayfin policies).
- [ ] &#91;CC\] `npx rayfin up db apply`, then `npx rayfin up`. Schema changes only ever go through code.
- [ ] &#91;YOU\] Grant `sg-capinsights-dev` Run and interact on the app, and Build on the semantic model.

**3.3 First screens** (deploy after each)

1. &#91;CC\] Live: capacity picker, current CU %, interactive and background split, throttling state, 30-second series for the last 2 hours, auto-refresh every 30 seconds.
2. &#91;CC\] Anomalies: scored points on the series, a table of open anomalies, link to the deep scan.

**3.4 Manual UI review loop** (runs from the first deploy to the gate)

1. &#91;CC\] After each `rayfin up`, post the app URL and what changed as a comment on the tracking issue.
2. &#91;YOU\] Open the app in the browser and check it against real data. File each fix as a GitHub issue labeled `ui-fix` with a screenshot, the screen, and expected versus actual.
3. &#91;CC\] Work `ui-fix` issues in priority order, deploy, and comment on each issue with the change. Never close a `ui-fix` issue; you close it after you look.
4. Repeat. UI changes are only made from `ui-fix` issues, so nothing changes on screen that you did not ask for.

**3.5 Rebalancer** (proposes, a person approves, a job executes)

- [ ] &#91;CC\] Optimizer in `packages/ui/src/rebalancer/`: input is hourly p95 CU per workspace and capacity size; output is a ranked list of single moves that lowers the peak on the hottest capacity without pushing the target above 80% at any hour. Same-region targets only. Unit tests with fixture data.
- [ ] &#91;CC\] Rebalancer screen: current load per capacity, proposed moves with before and after peak, an Approve button that writes `MoveApproval` (approvers only).
- [ ] &#91;CC\] `fabric/notebooks/rebalance_executor.ipynb`, scheduled every 5 minutes: reads approved, unexecuted moves from the app's SQL database, calls `POST /v1/workspaces/{id}/assignToCapacity`, polls the result, writes `MoveExecution` and `AuditLog`. During development it refuses any workspace not named `RB-Test-*`.
- [ ] &#91;YOU\] Make sure the executor's run identity is workspace Admin on the test workspaces and Contributor on both target capacities. The API needs `Capacity.ReadWrite.All` and `Workspace.ReadWrite.All` ([Assign To Capacity](https://learn.microsoft.com/rest/api/fabric/core/workspaces/assign-to-capacity)).
- [ ] &#91;YOU\] Run the test: `loadgen` on `RB-Test-A`, check the proposal, approve it, watch the move, then confirm load shifts on the dashboard.

**3.6 BPA screen**

- [ ] &#91;CC\] Findings by model and severity, joined to that model's CU from the workspace rollups, sorted so expensive models with violations come first. A Run scan now button is out of scope unless the app can start a notebook job; if it cannot, show the last scan time and the schedule.

**3.7 Ask AI spike** (2 days, time-boxed)

- [ ] &#91;CC\] Test whether the app can call a Fabric data agent over the KQL database with the signed-in user's identity. Write the result to `docs/decisions/002-ask-ai.md`.
- [ ] &#91;YOU\] Decide at the gate: in-app chat, a link out to the data agent, or deferred.

**3.8 Pilot**

- [ ] &#91;YOU\] Share the app with 3 to 5 pilot users and collect feedback as issues for one week.
- [ ] &#91;CC\] Measure the solution's own CU cost in the Capacity Metrics app on `cap-monitor` and record it in `docs/cost.md`.

**\[GATE\] Phase 3 exit**

- Pilot week done; every `ui-fix` issue marked P1 is closed by you.
- One approved move executed on `RB-Test-*` with rows in `MoveApproval`, `MoveExecution` and `AuditLog`.
- Solution cost on `cap-monitor` is recorded.
- Decision 002 (Ask AI) is recorded.
- The lead confirms the Workload Hub path from the overview before Phase 4 starts.

## Phase 4 · Package as a workload and test in our tenant

Goal: the same UI runs as an Extensibility Toolkit workload in our tenant's Workload Hub, and a user can add it to a fresh workspace, pick a capacity and see live data without our help. Internal publishing does not require the Workload Hub certification requirements ([publishing overview](https://learn.microsoft.com/fabric/extensibility-toolkit/publishing-overview)).

**4.1 Workload shell**

- [ ] &#91;CC\] Clone the Extensibility Toolkit Starter-Kit into `apps/workload`. Define one item type, `CapacityInsights`, whose editor renders `packages/ui`.
- [ ] &#91;CC\] Implement `CapacityDataSource` for the workload. The Fabric host issues Entra tokens for the scopes the manifest declares ([toolkit architecture](https://learn.microsoft.com/fabric/extensibility-toolkit/architecture)). First choice: query the KQL database directly with a token for its query endpoint. Fallback: DAX against the semantic model through the Power BI executeQueries API. Verify which scope the manifest can declare before writing the adapter.
- [ ] &#91;CC\] Store item config (capacity IDs, thresholds) as the item's own state in OneLake, replacing `AppConfig`.
- [ ] &#91;CC\] Move rebalancer approvals into a table the workload can write (Eventhouse table or SQL database in Fabric), keeping the same executor notebook.
- [ ] &#91;CC\] Local run with DevServer and DevGateway against `CapInsights-Dev`.

**4.2 Onboarding: "add to my workspace and pick a capacity"**

- [ ] &#91;CC\] Package Installer content built from `fabric/`: Eventhouse, KQL schema, Eventstream, notebooks with schedules, semantic model, real-time dashboard.
- [ ] &#91;CC\] Onboarding wizard in the item editor: pick capacity from the ones the user can see, install items, then show the Real-Time hub step as a guided manual step if 2.1 proved it cannot be scripted.
- [ ] &#91;CC\] Uninstall path that removes installed items and lists anything it could not remove.
- [ ] &#91;CC\] Recommend in the wizard that the monitoring workspace sits on a different capacity than the ones it watches.

**4.3 Identity and hosting**

- [ ] &#91;YOU\] Entra app registration for the workload (multi-tenant), redirect URIs, API permissions, admin consent in our tenant.
- [ ] &#91;YOU\] Microsoft Entra custom domain verification for the publisher domain.
- [ ] &#91;YOU\] Azure subscription and resource group, and approval for the hosting cost.
- [ ] &#91;CC\] `infra/` Bicep: Storage static website, Azure Front Door, Application Insights. Deploy with `az deployment group create`, then publish the built UI with the toolkit's deployment script ([host in Azure](https://learn.microsoft.com/en-us/fabric/extensibility-toolkit/tutorial-host-workload-in-azure)).
- [ ] &#91;CC\] GitHub Actions: build, test, produce `ManifestPackage.<version>.nupkg` as a release artifact, deploy the UI to a staging slot.

**4.4 Internal publish**

- [ ] &#91;YOU\] Fabric admin portal, Workload Management, Upload workload: the `.nupkg` from the release. Enable it for `sg-capinsights-dev` first.
- [ ] &#91;YOU\] Make sure no Workload ID gets confirmed here by accident. The confirmation in Phase 5 is permanent.

**4.5 Clean-room test**

- [ ] &#91;YOU\] As a non-admin pilot user: create a new workspace on `cap-monitor`, add Capacity Insights from the Workload Hub, onboard `cap-target-b`, and time it.
- [ ] &#91;CC\] Verify with `fab ls` that every expected item exists, and with a KQL count that rows arrive.
- [ ] &#91;YOU\] Run the uninstall and confirm the workspace is clean.
- [ ] &#91;CC\] Accessibility and theme pass on the workload shell (keyboard, contrast, light and dark).

**\[GATE\] Phase 4 exit**

- A non-admin user installs and onboards a capacity in under 15 minutes, following only the in-product guidance.
- Live data appears in the workload UI within the latency measured in Phase 2.
- Uninstall leaves nothing behind, or lists what it left.
- CI produces a versioned `.nupkg` on every tagged release.

## Phase 5 · Publish to the Workload Hub

Goal: Capacity Insights is listed as Preview in every tenant's Workload Hub, then moves to GA. Most of the elapsed time here is Microsoft validation, so start 5.1 and 5.2 in parallel with Phase 4.

**5.1 Workload ID and registration**

- [ ] &#91;YOU\] Choose the Workload ID in `[Publisher].[Workload]` form, for example `iLink.CapacityInsights`. It is fixed once registered and cannot be changed ([publish workload flow](https://learn.microsoft.com/en-us/fabric/extensibility-toolkit/publish-workload-flow)).
- [ ] &#91;YOU\] Decide the publishing tenant that will own the workload's lifecycle.
- [ ] &#91;YOU\] Submit registration at `https://aka.ms/fabric_workload_registration`.
- [ ] &#91;CC\] After approval: set the ID in the manifest, cut a release, produce the `.nupkg`.
- [ ] &#91;YOU\] Upload it in the publishing tenant's admin portal and confirm the Workload Name in the dialog.

**5.2 Listing material** (required for Preview and GA)

- [ ] &#91;YOU\] Legal: terms of use and privacy policy at stable HTTPS URLs, owned by legal. Required at both stages ([publishing requirements](https://learn.microsoft.com/fabric/extensibility-toolkit/publishing-requirements-workload)).
- [ ] &#91;YOU\] Certification attestation document and its link.
- [ ] &#91;YOU\] Support contact and SLA you will commit to.
- [ ] &#91;CC\] Draft the getting-started guide, FAQ, and a data-handling page that states no capacity telemetry leaves the customer tenant. Host them on the docs site.
- [ ] &#91;CC\] Write `docs/publishing/requirements-matrix.md`: every requirement on the Learn page, the evidence for it, and its status. Update it as feedback arrives.
- [ ] &#91;CC\] Listing assets: icons, screenshots and a short video recorded from the clean-room test.

**5.3 Selected-tenant testing**

- [ ] &#91;YOU\] Line up 2 to 5 partner or customer tenants. Their admin must enable the tenant setting that lets users work with workloads not validated by Microsoft.
- [ ] &#91;YOU\] Admin portal, your workload, Publish tab, Selected tenants: add their tenant IDs (up to 20), pick the version, publish. Allow up to 10 minutes for it to show ([publishing overview](https://learn.microsoft.com/fabric/extensibility-toolkit/publishing-overview)).
- [ ] &#91;YOU\] Each tenant runs the Phase 4 clean-room test. File issues per tenant.
- [ ] &#91;CC\] Fix, release, republish to the selected tenants.

**5.4 Preview and GA**

- [ ] &#91;YOU\] Submit the Publishing Request Form for Preview.
- [ ] &#91;CC\] Address validation feedback as issues labeled `phase-5`, each linked to a row in the requirements matrix.
- [ ] &#91;YOU\] When ready for GA, submit the request again to remove the Preview badge.
- [ ] &#91;YOU\] Optional: a SaaS offer in Partner Center if the workload will be sold rather than free.

**\[GATE\] Phase 5 exit**

- Listed as Preview in all tenants.
- Every requirement in the matrix shows evidence.
- At least two external tenants have run onboarding without our help.

## Appendix A · Repo layout

```text
capacity-insights/
  CLAUDE.md                  # rules below, read by Claude Code every session
  packages/ui/               # shared React screens, charts, rebalancer optimizer
    src/data/CapacityDataSource.ts
    src/rebalancer/
  apps/rayfin/               # Fabric App shell (Phases 3 onward)
    rayfin/rayfin.yml
    rayfin/connectors/
  apps/workload/             # Extensibility Toolkit shell (Phase 4 onward)
  fabric/
    eventstream/             # exported definitions
    kql/                     # 01_tables.kql ... 05_policies.kql
    semantic-model/          # TMDL
    notebooks/               # loadgen, baseline_refresh, bpa_scan, rebalance_executor
    activator/  rtd/
  infra/                     # Bicep for hosting
  scripts/                   # fab and rayfin wrappers, one per phase step
  docs/
    architecture/            # the two SVGs
    decisions/               # 001-workspace-cu-source.md, 002-ask-ai.md
    publishing/requirements-matrix.md
    latency.md  cost.md  tooling.md
  .github/workflows/
```

## Appendix B · Rules for CLAUDE.md

Paste these into `CLAUDE.md` so Claude Code follows them in every session.

1. Work from GitHub issues. Every change links an issue. UI changes come only from `ui-fix` issues, and only the human closes them.
2. Tasks labeled `you` are manual. Do not attempt them through any API, script or browser automation. Stop, print the step, and wait.
3. Run `--help` on any `fab` or `rayfin` command before its first use and record the exact flags in `scripts/`. Never guess a flag.
4. Use `-f` on `fab import` and `fab export` in scripts. Ask before any `fab rm` or item deletion.
5. Never call `assignToCapacity` from the app, a script or an interactive session. Only `rebalance_executor` calls it, only for rows in `MoveApproval`, and only for `RB-Test-*` workspaces until the Phase 3 gate is signed.
6. Never put secrets, keys or tokens in frontend code, `rayfin.yml` or the repo. Fabric Apps assets are served to users regardless of settings.
7. Rayfin schema changes go through code and `npx rayfin up db apply`, never by editing the SQL database.
8. KQL scripts are idempotent (`.create-or-alter`) and applied in file order.
9. After every deploy, comment on the tracking issue with the URL and what changed.
10. If a Learn page contradicts this plan, stop and flag it on the issue rather than working around it.
11. The SE&I Customer Demos Workspace (`415f790e-a590-4b59-b30a-c3a70a48de1e`) is shared. Create, change and delete only items inside our folder whose names start with `ci-`. Never touch any other item there.
12. Never change the SE&I workspace's settings: capacity assignment, roles, workspace monitoring, Log Analytics, Git connection. Each affects every demo in it. Raise it as a `you` issue instead.

## Appendix C · Risks and open questions

| Risk or question | Effect if it goes wrong | Where it is settled |
| --- | --- | --- |
| Capacity overview events are preview | Schema or behavior can change; no SLA | Re-check before Phase 5 submission |
| Capacity operation events not available in our tenant | No per-workspace CU, so no rebalancer | Decision 001, Phase 2 |
| DirectQuery latency or CU cost too high | App is not live, or costs more than it saves | Phase 2 gate, `docs/latency.md` |
| Eventstream capacity source cannot be scripted | Onboarding keeps one manual step | Task 2.1 export test |
| Fabric Apps status and region coverage | Pilot users in other regions cannot use it | Phase 1, region page |
| Fabric App cannot be listed on the Workload Hub | Two shells to maintain | Lead confirms before Phase 4 |
| Executor identity lacks rights on a customer's capacities | Approved moves fail | Executor checks rights before proposing |
| Moves across regions | Not supported for non-Power BI items | Optimizer filters by region |

## Sources

All pages read on 19 November 2026.

- [What is Fabric Apps?](https://learn.microsoft.com/en-us/fabric/apps/overview)
- [Connect Fabric Apps to Fabric data](https://learn.microsoft.com/en-us/fabric/apps/connectors)
- [Create a Fabric app](https://learn.microsoft.com/en-us/fabric/apps/create-app)
- [Extensibility Toolkit architecture](https://learn.microsoft.com/fabric/extensibility-toolkit/architecture)
- [Extensibility Toolkit overview](https://learn.microsoft.com/fabric/extensibility-toolkit/extensibility-toolkit-overview)
- [Host a workload in Azure](https://learn.microsoft.com/en-us/fabric/extensibility-toolkit/tutorial-host-workload-in-azure)
- [Publishing overview](https://learn.microsoft.com/fabric/extensibility-toolkit/publishing-overview)
- [Publish workload flow](https://learn.microsoft.com/en-us/fabric/extensibility-toolkit/publish-workload-flow)
- [Publishing requirements](https://learn.microsoft.com/fabric/extensibility-toolkit/publishing-requirements-workload)
- [Add Fabric capacity overview events to an eventstream](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/event-streams/add-source-fabric-capacity-overview-events)
- [Workspaces, Assign To Capacity](https://learn.microsoft.com/rest/api/fabric/core/workspaces/assign-to-capacity)
- [Fabric CLI command reference](https://microsoft.github.io/fabric-cli/commands)
