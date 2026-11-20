# Deploy Capacity Insights to another workspace

For a colleague who wants to run Capacity Insights in their own Fabric workspace and test it.

There are two parts. Part A is enough to see live capacity data. Part B adds the app.

| | Part A: data items | Part B: the app |
| --- | --- | --- |
| What you get | Eventhouse with the schema, semantic model, fallback dashboard, two scheduled notebooks, data agent | The Capacity Insights app (eight screens and the Ask pane) |
| How | Import one notebook and select Run all | Clone this repository and run four commands |
| Time | About 15 minutes, including the manual steps | About 15 minutes |
| Needs | A Fabric workspace on a Fabric capacity | Part A done, Node.js 22 or 24, Python 3, access to this repository |

> **Status:** the installer notebook has not been run end to end in a second workspace yet. Your run is the first test. Each step reports on its own, so if one fails, copy its line from the output and send it back.

## Before you start

- A Fabric workspace where you are **Contributor or higher**, on a **Fabric capacity** (F SKU or trial).
- To monitor a capacity you must be an **admin of that capacity**.
- The data agent needs a **paid F2 or larger** capacity and the data agent tenant settings. On a trial capacity, set `INSTALL_DATA_AGENT = False` in the notebook.
- For Part B, the **Fabric Apps** tenant setting must be on for you.

## If you are in a different tenant

This is built to work in any tenant. A few things differ from tenant to tenant, so check them first.

**Nothing connects back to the original environment.** The notebook carries no IDs, addresses or keys from the tenant it was built in. Everything it creates lives in your workspace, and your data stays in your tenant.

**Tenant settings in your tenant** (a Fabric admin sets these; if one is off, that step fails and the rest still works):

| Needed for | Setting |
| --- | --- |
| Everything | Users can create Fabric items |
| Capacity events (the Eventstream) | Real-Time hub Fabric events must be available to you |
| The data agent | The Fabric data agent and Copilot settings, including cross-geo processing where your region needs it |
| Model health (the BPA scan) | XMLA endpoint at least Read on the capacity that holds your semantic models |
| Part B, the app | Fabric Apps |

This list comes from Microsoft's documentation and has not been checked in a second tenant yet. If a step fails with a permission or "feature not enabled" message, it is most likely one of these.

**Your capacity will not match ours.** The notebook reads your workspace's capacity first and adapts:

| Your capacity | What happens |
| --- | --- |
| Trial (FT SKUs) | The data agent is skipped automatically. Everything else installs |
| Small (F2, F4) | It installs, with a warning: the Eventhouse and Eventstream run all the time and can take a large share of a small capacity. Remove them after testing |
| Premium (P SKUs) with autoscale | CU % can read wrong, because autoscale adds capacity the events do not report |
| Not on a capacity | The notebook stops with a message before creating anything |

**The capacity you monitor can be a different one** from the capacity your workspace runs on. You choose it when you add the Eventstream sources, and you must be an admin of it.

**Signing in for Part B:** if your account belongs to more than one tenant, name the tenant so the app deploys to the right one: `npx rayfin login --tenant <your tenant id>`.

## Part A: data items

1. Get the file `fabric/installer/CapacityInsights_Install.ipynb` (from this repository, or sent to you directly). It contains every definition it needs; it does not download anything.
2. In your workspace, select **Import**, then **Notebook**, then **From this computer**, and pick the file.
3. Open the notebook. Change the parameters only if you need to:
   - `PREFIX`: start of every item name. Default `ci-`.
   - `FOLDER`: workspace folder for the items. Default `Capacity Insights`.
   - `INSTALL_DATA_AGENT`: set to `False` on a trial capacity.
4. Select **Run all**. It takes 3 to 5 minutes. Each step prints a line such as `[created] Eventhouse`.
5. At the end it prints **"What is left to do by hand"**. Do those steps:
   - **Create the Eventstream** and connect it to the new Eventhouse table `RawCapacityEvents`. The exact clicks are printed with your item names.
   - **Set the semantic model credentials** once (OAuth2, sign in).
6. Wait 2 minutes, then open the dashboard `ci-capinsights-breakglass`. Tiles fill in as events arrive.

Running the notebook again is safe. Existing items are updated, not duplicated.

### What Part A does not do

- It does not create the Eventstream. Its link to the Eventhouse is set up by a wizard in the portal that we have not reproduced through the API.
- It does not set credentials on the semantic model. That needs your own sign-in.
- It does not create Activator alert rules.

## Part B: the app

You need this repository on your machine.

1. Clone and install:

   ```powershell
   git clone https://github.com/DharunKarthicksa/Capacity_Workload.git
   cd Capacity_Workload
   npm install
   ```

2. Create `apps/rayfin/target.json` from the block the notebook printed at the end ("Copy this block into apps/rayfin/target.json"). Add the Eventstream ID: open your Eventstream in Fabric and copy the GUID after `/eventstreams/` in the address bar.

   ```json
   {
     "workspaceId": "<your workspace id>",
     "workspaceName": "<shown next to the app name>",
     "semanticModelId": "<from the notebook>",
     "dataAgentId": "<from the notebook, or empty>",
     "eventstreamId": "<from the Eventstream address>",
     "eventstreamName": "ci-capacity-overview"
   }
   ```

3. Point the app at your items:

   ```powershell
   python scripts/set_app_target.py apps/rayfin/target.json
   ```

4. Sign in and deploy:

   ```powershell
   cd apps/rayfin
   npx rayfin login
   npx rayfin up --workspace-id <your workspace id> --item-name ci-capinsights
   ```

   `rayfin up` creates the App item in your workspace and prints the app address ("Your app is live at ..."). Answer yes to its prompts.

5. Open the address, sign in, and switch between **Live** and **Sample** in the header.

Step 3 changes three files locally (`rayfin.yml`, `function_app.ts`, `rayfin-source.ts`). It also removes the original environment's app address from the sign-in redirect list, so only your own app can complete a sign-in. Do not commit these changes. To undo: `git checkout -- apps/rayfin`.

## What to test

| Check | Where | Expected |
| --- | --- | --- |
| Events arrive | Dashboard `ci-capinsights-breakglass`, first tile | "Seconds since last event" under 120 |
| Live data | App, Overview, Live mode | CU %, three throttling windows, a chart that moves every 30 s |
| Tooltips and drill-through | App, any chart | Hover shows values; a click asks the agent about that time |
| Model findings | Run `ci-bpa-scan` once, then App, Model health | Your workspace's semantic models with findings |
| Data agent | App, Ask pane, Live mode | An answer within a minute, with numbers that match the screen |
| Add capacity | App, All capacities | "Not monitored yet" lists the capacities the app owner administers |
| Full design | App, Sample mode | All eight screens with sample numbers |

Known gaps, so you do not report them as bugs:

- **Workspaces & items** and **Rebalance** are empty in Live mode until capacity operation events arrive. We have not received any yet.
- **Anomaly scores** stay empty for the first days, until the hourly baseline has history.
- The **Ask pane** answers with the app owner's access, not the viewer's.
- Capacity events are **not backfilled**. History starts when the Eventstream is published.

## Remove it again

Delete these from your workspace (names shown with the default prefix): the app `ci-capinsights`, `ci-capacity-overview` (Eventstream), `ci-data-agent`, `ci-bpa-scan`, `ci-baseline-refresh`, `ci-capinsights-breakglass`, `ci-semantic-model`, `ci-eventhouse`, the folder, and the installer notebook.

## For the maintainers

- Rebuild the installer after changing anything under `fabric/`: `python scripts/build_installer.py`.
- The install logic is `fabric/installer/installer.py`. The notebook is generated; do not edit it by hand.
- The build swaps our workspace ID, cluster address and database ID for neutral tokens, and fails if any are left. The installer fills in the target's values. The notebook carries no identifiers, tokens or keys of ours.
- `scripts/set_app_target.py` is how the app is pointed at another workspace. The repository's own values are ours; never commit a retargeted copy.
