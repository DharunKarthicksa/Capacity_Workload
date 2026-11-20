# Install Capacity Insights in your own workspace

One notebook sets up everything. You import it, select **Run all**, and about 5 minutes later you have live capacity monitoring and the app.

> **Status:** the notebook has been run end to end in the workspace it was built in. It has not been run in a second tenant yet, so if you are in another tenant, your run is the first test of that. Every step reports on its own line; if one says `failed`, copy that line and send it back.

## What you need

- A Fabric workspace on a **Fabric capacity**, where you are **Contributor or higher**.
- To be an **admin of the capacity you want to monitor**. By default that is the capacity your workspace runs on.
- For the app: the **Fabric Apps** tenant setting turned on for you.

You do not need Node.js, git or this repository. Nothing is installed on your computer.

## Steps

1. Get the file `fabric/installer/CapacityInsights_Install.ipynb` (from this repository, or sent to you directly).
2. In your workspace select **Import**, **Notebook**, **From this computer**, and pick the file.
3. Open it and select **Run all**.
4. Read the last cell when it finishes. It lists what was created, the app address, and anything left to do by hand.
5. Do the one manual step it always lists: **sign in once on the semantic model**. Workspace, `ci-semantic-model`, Settings, Data source credentials, Edit credentials, OAuth2, Sign in.
6. Open the app address and sign in. Use the **Live / Sample** switch in the header. Sample shows the whole design at once; Live shows your capacity.

That is all for a normal run.

## What it creates

All in the workspace the notebook is in, inside a folder named `Capacity Insights`:

| Item | Name |
| --- | --- |
| Eventhouse and KQL database, with the full schema | `ci-eventhouse` |
| Eventstream: capacity events in, Eventhouse out | `ci-capacity-overview` |
| Semantic model | `ci-semantic-model` |
| Real-Time Dashboard (a plain fallback view) | `ci-capinsights-breakglass` |
| Notebooks, scheduled hourly and daily | `ci-baseline-refresh`, `ci-bpa-scan` |
| Data agent | `ci-data-agent` |
| The app, and two function items the deploy adds with it | `ci-capinsights` |

Running the notebook again is safe. Existing items are updated, not duplicated, and an Eventstream that already exists is never changed.

## Settings you can change

They are in the notebook's second cell. The defaults are fine for a first run.

| Setting | Default | Change it when |
| --- | --- | --- |
| `PREFIX` | `ci-` | You want different item names |
| `FOLDER` | `Capacity Insights` | You want another folder, or `""` for the workspace root |
| `MONITOR_CAPACITY_ID` | empty | You want to monitor a capacity other than the one the workspace runs on |
| `INSTALL_APP` | `True` | Fabric Apps is off in your tenant, or notebooks cannot reach the internet |
| `INSTALL_DATA_AGENT` | `True` | Your tenant does not allow data agents |
| `SCHEDULE_NOTEBOOKS` | `True` | You only want a short test |

## If something does not go to plan

The notebook adapts where it can and tells you what it did.

| What it finds | What happens |
| --- | --- |
| Workspace is not on a capacity | It stops before creating anything and says so |
| Trial capacity | The data agent is skipped. Everything else installs |
| Small capacity (F2, F4) | It installs, with a warning that the always-on items can use a large share of it |
| You are not an admin of the capacity | The Eventstream is created but its source fails. The last cell tells you to fix and publish it |
| The capacity is in a different region from the workspace | Only overview events are collected. Fabric does not deliver operation events across regions, so per-workspace detail stays empty |
| The Eventstream setup is refused | An empty Eventstream is created and the last cell gives the steps to finish it by hand |
| Fabric Apps is off, or notebooks cannot reach the internet | The app step fails with the reason. Everything else is still installed |

Tenant settings that matter (a Fabric admin sets these): users can create Fabric items, Fabric Apps, the data agent and Copilot settings, and XMLA endpoint Read on the capacity for the model scan. This list comes from Microsoft's documentation and has not been checked in a second tenant.

### Finishing the Eventstream by hand

Only if the last cell asks for it:

1. Open `ci-capacity-overview` and select **Edit**.
2. **Add source**, **Fabric capacity overview events**, pick the capacity, keep all event types.
3. **Add source**, **Fabric capacity operation events**, the same capacity. This only works when the capacity is in the workspace's region.
4. **Add destination**, **Eventhouse**, this workspace, `ci-eventhouse`, table `RawCapacityEvents`.
5. **Publish**.

## What to test

| Check | Where | Expected |
| --- | --- | --- |
| Events arrive | Last cell of the notebook, or the dashboard `ci-capinsights-breakglass` | Events in the last 15 minutes |
| Live data | App, Overview, Live mode | CU %, three throttling windows, a chart that moves every 30 s |
| Tooltips and drill-through | App, any chart | Hover shows values; a click asks the agent about that time |
| Model findings | Run `ci-bpa-scan` once, then App, Model health | Your workspace's semantic models with findings |
| Data agent | App, Ask pane, Live mode | An answer within a minute, with numbers that match the screen |
| Add capacity | App, All capacities | "Not monitored yet" lists the capacities the app owner administers |
| Full design | App, Sample mode | All eight screens with sample numbers |

Known gaps, so you do not report them as bugs:

- **Workspaces & items** and **Rebalance** are empty in Live mode until operation events arrive. Those need the monitored capacity to be in the workspace's region.
- **Anomaly scores** stay empty for the first days, until the hourly baseline has history.
- The **Ask pane** answers with the app owner's access, not the viewer's.
- Capacity events are **not backfilled**. History starts when the Eventstream starts.

## Remove it again

Delete the items in the `Capacity Insights` folder, then the folder and the installer notebook. The Eventhouse and the Eventstream run all the time, so remove them when you finish testing on a small capacity.

## Privacy

The notebook carries no IDs, addresses or keys from the environment it was built in, and nothing it creates connects back to it. Your data stays in your tenant.

## For the maintainers

- Rebuild the notebook after changing anything under `fabric/`, `packages/ui/` or `apps/rayfin/`: `python scripts/build_installer.py`. The app source is packed from tracked files, so commit first.
- The logic is in `fabric/installer/`: `installer.py` (data items and Eventstream), `app_installer.py` (the app), `summary.py` (the last cell). The notebook is generated; do not edit it by hand.
- The build swaps our workspace ID, cluster address, item IDs and app address for neutral values and fails if any are left.
- To deploy the app from a computer instead (Node.js 22 or 24, Python 3): create `apps/rayfin/target.json` with the target's IDs, run `python scripts/set_app_target.py apps/rayfin/target.json`, then `npx rayfin login` and `npx rayfin up --workspace-id <id> --item-name ci-capinsights` in `apps/rayfin`. Never commit a retargeted copy.
