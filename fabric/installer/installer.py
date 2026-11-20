# Capacity Insights installer logic. scripts/build_installer.py embeds this file and the item definitions
# into fabric/installer/CapacityInsights_Install.ipynb. It runs in a Fabric Python notebook and creates the
# items in the notebook's own workspace. Re-running is safe: existing items are updated, not duplicated.
#
# Expects these names from earlier cells: PREFIX, FOLDER, INSTALL_DATA_AGENT, SCHEDULE_NOTEBOOKS, MONITOR_CAPACITY_ID,
# BUNDLE_B64, SOURCE.
import base64
import gzip
import json
import time

import requests

API = "https://api.fabric.microsoft.com/v1"
WS = notebookutils.runtime.context["currentWorkspaceId"]  # noqa: F821 (provided by the Fabric notebook)
FILES = json.loads(gzip.decompress(base64.b64decode(BUNDLE_B64)).decode("utf-8"))  # noqa: F821
RESULT = {"workspaceId": WS, "steps": []}


def log(step, status, detail=""):
    RESULT["steps"].append({"step": step, "status": status, "detail": detail})
    print(f"[{status:7}] {step}{' - ' + detail if detail else ''}")


def fabric_token():
    return notebookutils.credentials.getToken("pbi")  # noqa: F821


def call(method, path, body=None, ok=(200, 201, 202)):
    """Fabric REST call. Follows long-running operations and returns the final JSON (or {})."""
    url = path if path.startswith("http") else f"{API}/{path}"
    r = requests.request(method, url, json=body, headers={"Authorization": f"Bearer {fabric_token()}"}, timeout=120)
    if r.status_code not in ok:
        raise RuntimeError(f"{method} {path} -> HTTP {r.status_code}: {r.text[:500]}")
    if r.status_code == 202:
        op = r.headers.get("x-ms-operation-id")
        if not op:
            return {}
        for _ in range(90):
            time.sleep(int(r.headers.get("Retry-After", 4)) if _ == 0 else 4)
            st = requests.get(f"{API}/operations/{op}", headers={"Authorization": f"Bearer {fabric_token()}"}, timeout=60).json()
            if st.get("status") == "Succeeded":
                res = requests.get(f"{API}/operations/{op}/result", headers={"Authorization": f"Bearer {fabric_token()}"}, timeout=60)
                return res.json() if res.status_code == 200 and res.text.strip() else {}
            if st.get("status") == "Failed":
                raise RuntimeError(f"{method} {path} failed: {json.dumps(st.get('error'))[:500]}")
        raise RuntimeError(f"{method} {path} timed out")
    return r.json() if r.text.strip() else {}


def listing(path):
    out, url = [], f"{API}/{path}"
    while url:
        page = call("GET", url)
        out += page.get("value", [])
        url = page.get("continuationUri")
    return out


def find(kind, name):
    return next((i for i in listing(f"workspaces/{WS}/{kind}") if i["displayName"] == name), None)


def part(path, text):
    return {"path": path, "payload": base64.b64encode(text.encode("utf-8")).decode(), "payloadType": "InlineBase64"}


def swap(text, extra=()):
    """Point a definition at this workspace's items instead of the source environment's."""
    for old, new in list(extra) + [(SOURCE["cluster"], TARGET["cluster"]), (SOURCE["databaseId"], TARGET["databaseId"]),  # noqa: F821
                                   (SOURCE["workspaceId"], WS)]:  # noqa: F821
        text = text.replace(old, new)
    return text


def ensure(kind, name, definition=None, fmt=None):
    """Create the item, or update its definition if it already exists. Returns the item id."""
    found = find(kind, name)
    d = None
    if definition is not None:
        d = {"parts": definition}
        if fmt:
            d["format"] = fmt
    if found:
        if d:
            call("POST", f"workspaces/{WS}/{kind}/{found['id']}/updateDefinition", {"definition": d})
        return found["id"], "updated"
    body = {"displayName": name}
    if TARGET.get("folderId"):
        body["folderId"] = TARGET["folderId"]
    if d:
        body["definition"] = d
    created = call("POST", f"workspaces/{WS}/{kind}", body)
    item_id = created.get("id") or (find(kind, name) or {}).get("id")
    if not item_id:
        raise RuntimeError(f"{name} was created but could not be found afterwards")
    return item_id, "created"


TARGET = {}

# 0. Where are we? -------------------------------------------------------------------------------
# Every tenant and capacity is different, so look before creating anything.
WS_NAME = ""
WS_CAPACITY = {}
MY_CAPACITIES = []
try:
    ws_info = call("GET", f"workspaces/{WS}")
    WS_NAME = ws_info.get("displayName", "")
    cap_id = str(ws_info.get("capacityId") or "")
    if not cap_id:
        raise RuntimeError(f"Workspace '{WS_NAME}' is not on a Fabric capacity. Assign one in Workspace settings, then run again.")
    cap = None
    try:  # only lists capacities you administer or contribute to; that is fine, the SKU is just for advice
        MY_CAPACITIES = listing("capacities")
        cap = next((c for c in MY_CAPACITIES if str(c.get("id", "")).lower() == cap_id.lower()), None)
    except Exception:
        pass
    WS_CAPACITY = dict(cap or {}, id=cap_id)
    sku = str((cap or {}).get("sku", "")).upper()
    log("Workspace", "ok", f"'{WS_NAME}' on capacity {(cap or {}).get('displayName', cap_id)}"
        + (f" ({sku}, {cap.get('region', '?')})" if cap else " (SKU not visible to you)"))
    if INSTALL_DATA_AGENT and sku.startswith("FT"):  # noqa: F821
        INSTALL_DATA_AGENT = False
        log("Data agent", "skipped", "this is a trial capacity; data agents need a paid F2 or larger")
    if sku in ("F2", "F4"):
        print("   note: an Eventhouse and an Eventstream run all the time. On a capacity this small they can use a large "
              "share of it. Remove the items when you finish testing.")
except RuntimeError:
    raise
except Exception as e:
    log("Workspace", "skipped", f"could not read workspace details: {str(e)[:200]}")

# 1. Folder ---------------------------------------------------------------------------------------
try:
    if FOLDER:  # noqa: F821
        folders = listing(f"workspaces/{WS}/folders")
        f = next((x for x in folders if x["displayName"] == FOLDER), None)  # noqa: F821
        TARGET["folderId"] = (f or call("POST", f"workspaces/{WS}/folders", {"displayName": FOLDER}))["id"]  # noqa: F821
        log("Folder", "ok", FOLDER)  # noqa: F821
except Exception as e:  # folders are a convenience; carry on in the workspace root
    log("Folder", "skipped", str(e)[:200])

# 2. Eventhouse and its KQL database ---------------------------------------------------------------
EH_NAME = PREFIX + "eventhouse"  # noqa: F821
eh_id, how = ensure("eventhouses", EH_NAME)
db = None
for _ in range(40):
    for k in listing(f"workspaces/{WS}/kqlDatabases"):
        props = call("GET", f"workspaces/{WS}/kqlDatabases/{k['id']}").get("properties", {})
        if props.get("parentEventhouseItemId") == eh_id:
            db = {"id": k["id"], "name": k["displayName"], "cluster": props["queryServiceUri"]}
            break
    if db:
        break
    time.sleep(6)
if not db:
    raise RuntimeError("The Eventhouse was created but its KQL database did not appear. Wait a minute and run again.")
TARGET.update({"cluster": db["cluster"], "databaseId": db["id"], "databaseName": db["name"], "eventhouseId": eh_id})
log("Eventhouse", how, f"{EH_NAME} at {db['cluster']}")

# 3. KQL schema ------------------------------------------------------------------------------------
kusto_token = notebookutils.credentials.getToken(db["cluster"])  # noqa: F821
r = requests.post(f"{db['cluster']}/v1/rest/mgmt", timeout=300,
                  json={"db": db["name"], "csl": ".execute database script with (ContinueOnErrors=true) <|\n" + FILES["kql/schema.kql"]},
                  headers={"Authorization": f"Bearer {kusto_token}"})
if not r.ok:
    raise RuntimeError(f"KQL schema failed: HTTP {r.status_code} {r.text[:500]}")
t = r.json()["Tables"][0]
cols = [c["ColumnName"] for c in t["Columns"]]
rows = [dict(zip(cols, x)) for x in t["Rows"]]
bad = [x for x in rows if x.get("Result") != "Completed"]
log("KQL schema", "ok" if not bad else "partial", f"{len(rows) - len(bad)} of {len(rows)} commands completed")
for x in bad:
    print("   failed:", str(x.get("CommandText"))[:80].replace("\n", " "), "|", str(x.get("Reason"))[:200])

# 4. Semantic model --------------------------------------------------------------------------------
try:
    sm_parts = [part(p[len("semantic-model/"):], swap(txt, [(f'"{SOURCE["databaseName"]}"', f'"{db["name"]}"')]))  # noqa: F821
                for p, txt in FILES.items() if p.startswith("semantic-model/")]
    TARGET["semanticModelId"], how = ensure("semanticModels", PREFIX + "semantic-model", sm_parts)  # noqa: F821
    log("Semantic model", how, "set its data source credentials once (see the steps printed at the end)")
except Exception as e:
    log("Semantic model", "failed", str(e)[:300])

# 5. Break-glass dashboard -------------------------------------------------------------------------
try:
    dash = json.loads(swap(FILES["rtd/RealTimeDashboard.json"]))
    for ds in dash.get("dataSources", []):
        ds["name"] = db["name"]
    TARGET["dashboardId"], how = ensure("kqlDashboards", PREFIX + "capinsights-breakglass", [part("RealTimeDashboard.json", json.dumps(dash))])  # noqa: F821
    log("Dashboard", how)
except Exception as e:
    log("Dashboard", "failed", str(e)[:300])

# 6. Notebooks -------------------------------------------------------------------------------------
for stem, minutes in (("baseline_refresh", 60), ("bpa_scan", 1440)):
    name = PREFIX + stem.replace("_", "-")  # noqa: F821
    try:
        text = swap(FILES[f"notebooks/{stem}.ipynb"], [(f'DATABASE = \\"{SOURCE["databaseName"]}\\"', f'DATABASE = \\"{db["name"]}\\"')])  # noqa: F821
        nb_id, how = ensure("notebooks", name, [part("notebook-content.ipynb", text)], fmt="ipynb")
        TARGET[stem + "Id"] = nb_id
        detail = ""
        if SCHEDULE_NOTEBOOKS:  # noqa: F821
            sched = call("GET", f"workspaces/{WS}/items/{nb_id}/jobs/RunNotebook/schedules").get("value", [])
            if not sched:
                call("POST", f"workspaces/{WS}/items/{nb_id}/jobs/RunNotebook/schedules", {"enabled": True, "configuration": {
                    "type": "Cron", "startDateTime": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
                    "endDateTime": "2027-12-31T00:00:00", "localTimeZoneId": "UTC", "interval": minutes}})
            detail = f"scheduled every {minutes} min"
        log(f"Notebook {name}", how, detail)
    except Exception as e:
        log(f"Notebook {name}", "failed", str(e)[:300])

# 7. Data agent ------------------------------------------------------------------------------------
if INSTALL_DATA_AGENT:  # noqa: F821
    try:
        old_dir, new_dir = f"kusto-{SOURCE['databaseName']}", f"kusto-{db['name']}"  # noqa: F821
        da_parts = [part(p[len("data-agent/"):].replace(old_dir, new_dir),
                         swap(txt, [(f'"displayName": "{SOURCE["databaseName"]}"', f'"displayName": "{db["name"]}"')]))  # noqa: F821
                    for p, txt in FILES.items() if p.startswith("data-agent/")]
        TARGET["dataAgentId"], how = ensure("dataAgents", PREFIX + "data-agent", da_parts)  # noqa: F821
        log("Data agent", how, "published over the new KQL database")
    except Exception as e:
        log("Data agent", "failed", str(e)[:300] + " (needs a paid F2 or larger capacity and the data agent tenant settings)")

# 8. Eventstream ----------------------------------------------------------------------------------
# Created ready to run: capacity events in, the Eventhouse table out. If the service refuses the configuration,
# an empty Eventstream is created instead and the manual steps are printed at the end.
ES_NAME = PREFIX + "capacity-overview"  # noqa: F821
MONITORED = (MONITOR_CAPACITY_ID or WS_CAPACITY.get("id") or "").lower()  # noqa: F821
TODO = []
ES_MANUAL = f"""Finish the Eventstream {ES_NAME} by hand (about 5 minutes):
     - Open {ES_NAME} and select Edit.
     - Add source > Fabric capacity overview events > pick the capacity to monitor > keep all event types.
     - Add source > Fabric capacity operation events > the same capacity (only works when the capacity is in
       this workspace's region).
     - Add destination > Eventhouse > this workspace > {EH_NAME} > database {db['name']} > table RawCapacityEvents.
     - Publish. You need to be an admin of the capacity you pick."""


def eventstream_definition(capacity_id, with_operations):
    sources = [{"name": "capacity-overview", "type": "FabricCapacityOverviewEvents", "properties": {
        "eventScope": "Capacity", "capacityId": capacity_id, "filters": [],
        "includedEventTypes": ["Microsoft.Fabric.Capacity.State", "Microsoft.Fabric.Capacity.Summary", "Microsoft.Fabric.Capacity.OnDemandSummary"]}}]
    if with_operations:
        sources.append({"name": "capacity-operation", "type": "FabricCapacityOperationEvents", "properties": {
            "eventScope": "Capacity", "capacityId": capacity_id, "filters": [],
            "includedEventTypes": ["Microsoft.Fabric.CapacityOperationEvents.Operation"]}})
    stream = ES_NAME + "-stream"
    return {
        "sources": sources,
        "destinations": [{"name": "Eventhouse", "type": "Eventhouse", "inputNodes": [{"name": stream}], "properties": {
            "dataIngestionMode": "ProcessedIngestion", "workspaceId": WS, "itemId": db["id"], "databaseName": db["name"],
            "tableName": "RawCapacityEvents", "inputSerialization": {"type": "Json", "properties": {"encoding": "UTF8"}}}}],
        "streams": [{"name": stream, "type": "DefaultStream", "properties": {}, "inputNodes": [{"name": x["name"]} for x in sources]}],
        "operators": [], "compatibilityLevel": "1.1",
    }


def eventstream_status(es_id):
    """Per-node status after creation, so a failed source is reported instead of silently missing."""
    nodes = []
    for _ in range(12):
        topo = call("GET", f"workspaces/{WS}/eventstreams/{es_id}/topology")
        nodes = topo.get("sources", []) + topo.get("destinations", [])
        if nodes and all(n.get("status") in ("Running", "Failed", "Warning") for n in nodes):
            break
        time.sleep(10)
    return [f"{n.get('name')}: {n.get('status')} - {str((n.get('error') or {}).get('errorMessage', ''))[-220:]}"
            for n in nodes if n.get("status") != "Running"]


try:
    existing_es = find("eventstreams", ES_NAME)
    if existing_es:
        TARGET["eventstreamId"] = existing_es["id"]
        problems = eventstream_status(existing_es["id"])
        log("Eventstream", "exists", "left as it is" + ("; " + " | ".join(problems) if problems else ""))
    elif not MONITORED:
        TARGET["eventstreamId"], _ = ensure("eventstreams", ES_NAME)
        TODO.append(ES_MANUAL)
        log("Eventstream", "created", "empty: no capacity to monitor could be worked out, add the sources by hand")
    else:
        # Operation events are refused across regions, so only ask for them when the capacity is in this workspace's region.
        mon = next((c for c in MY_CAPACITIES if str(c.get("id", "")).lower() == MONITORED), None)
        same_region = mon is None or not WS_CAPACITY.get("region") or mon.get("region") == WS_CAPACITY.get("region")
        try:
            definition = [part("eventstream.json", json.dumps(eventstream_definition(MONITORED, same_region))),
                          part("eventstreamProperties.json", json.dumps({"retentionTimeInDays": 1, "eventThroughputLevel": "Low"}))]
            TARGET["eventstreamId"], how = ensure("eventstreams", ES_NAME, definition)
            problems = eventstream_status(TARGET["eventstreamId"])
            name = (mon or {}).get("displayName", MONITORED)
            log("Eventstream", how if not problems else "partial", f"monitoring capacity {name}" + ("" if same_region else
                " (overview events only: operation events are not available across regions)"))
            for pr in problems:
                if "Cross-region is not supported" in pr:
                    print("   note: this capacity is in a different region from the workspace, and Fabric does not deliver operation "
                          "events across regions. Capacity-level monitoring works; per-workspace detail will stay empty.")
                else:
                    print("   problem:", pr)
            if any(pr.startswith("capacity-overview") or pr.startswith("Eventhouse") for pr in problems):
                TODO.append("The Eventstream was created but part of it is not running (see the 'problem' lines above). "
                            "The usual cause is that you are not an admin of the capacity. Open it, fix the failed part and publish.")
        except Exception as e:
            TARGET["eventstreamId"], _ = ensure("eventstreams", ES_NAME)
            TODO.append(ES_MANUAL)
            log("Eventstream", "created", f"empty: the automatic setup was refused ({str(e)[:160]})")
except Exception as e:
    TODO.append(ES_MANUAL.replace("Finish the Eventstream", "Create an Eventstream named").replace(" by hand", " and set it up by hand"))
    log("Eventstream", "failed", str(e)[:300])

TODO.append(f"""Set the semantic model credentials once (1 minute). Without this the app shows no live data:
     - Workspace > {PREFIX}semantic-model > Settings > Data source credentials > Edit credentials > OAuth2 > Sign in.""")  # noqa: F821
RESULT["target"] = TARGET
