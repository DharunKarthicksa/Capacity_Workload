"""Break-glass Real-Time Dashboard for Capacity Insights (fallback view if the app is unavailable).

  python scripts/build_dashboard.py            # write fabric/rtd/RealTimeDashboard.json
  python scripts/build_dashboard.py --check    # also run every tile query against the KQL database (needs az login)
  python scripts/build_dashboard.py --deploy   # create or update the dashboard item in the Capacity Workload folder

Shapes follow what loads in the Fabric UI (see memory note fabric-rtd-json-gotchas): kusto-trident data source,
inline dataSource refs, supported visual types, an empty-"Select all" capacity filter, 1 hour default range.
Ids are uuid5 of names so re-runs are stable. Uses only the standard library plus the `az` and `fab` CLIs.
"""
import base64
import json
import os
import subprocess
import sys
import urllib.request
import uuid

WORKSPACE_ID = "415f790e-a590-4b59-b30a-c3a70a48de1e"
FOLDER_ID = "b556fb13-1994-4e86-9efc-8039e4b6ed11"        # Capacity Workload
KQL_DB_ITEM_ID = "32dbe0c2-14e8-4199-8be2-f9e99ccdcfc1"   # ci-eventhouse.KQLDatabase
KQL_URI = "https://trd-3p56kn96phc55ysd7n.z5.kusto.fabric.microsoft.com"
KQL_DB = "ci-eventhouse"
TITLE = "ci-capinsights-breakglass"
DEFAULT_RANGE = (1, "hours")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "fabric", "rtd")
NS = uuid.UUID("c0de0001-0000-4000-8000-00000000ca91")


def uid(name):
    return str(uuid.uuid5(NS, name))


CAP = "(CapacityName in (_capacity) or tostring(_capacity) in ('', '[]', '[\"\"]'))"
RNG = "Timestamp between (_startTime .. _endTime)"
TILES = []


def tile(key, title, visual, x, y, w, h, kql):
    TILES.append((key, title, visual, x, y, w, h, kql.strip()))


# Row 0: freshness and current state (a break-glass view must say how stale it is)
tile("fresh", "Data freshness: seconds since last event", "card", 0, 0, 6, 4,
     "RawCapacityEvents | summarize latest_event = max(['time']) | project seconds_since_last_event = toint((now() - latest_event) / 1s)")
tile("cu", "CU % (latest)", "card", 6, 0, 6, 4,
     f"CapacitySummary | where {RNG} and {CAP} | summarize arg_max(Timestamp, CuPercent) | project cu_percent = round(CuPercent, 3)")
tile("split", "Interactive vs background % (latest)", "multistat", 12, 0, 6, 4,
     f"CapacitySummary | where {RNG} and {CAP} | summarize arg_max(Timestamp, InteractivePercent, BackgroundPercent) | project interactive_pct = round(InteractivePercent, 3), background_pct = round(BackgroundPercent, 3)")
tile("overage", "Overage CU-ms (latest window)", "card", 18, 0, 6, 4,
     f"CapacitySummary | where {RNG} and {CAP} | summarize arg_max(Timestamp, OverageCuMs) | project overage_cu_ms = OverageCuMs")

# Row 1: trend
tile("trend", "CU % over time, with 100% line", "line", 0, 4, 12, 8,
     f"CapacitySummary | where {RNG} and {CAP} | summarize cu = avg(CuPercent), interactive = avg(InteractivePercent), background = avg(BackgroundPercent) by t = bin(Timestamp, 1m) | extend limit_100 = 100.0 | order by t asc")
tile("anom", "Anomaly score over time (alert above 3)", "column", 12, 4, 12, 8,
     f"CapacitySummary | where {RNG} and {CAP} and isnotnull(AnomalyScore) | summarize anomaly_score = max(AnomalyScore) by t = bin(Timestamp, 5m) | order by t asc")

# Row 2: workload mix and state
tile("mix", "CU by workload (CU-ms per 5 min)", "line", 0, 12, 12, 8,
     f"CapacitySummary | where {RNG} and {CAP} | mv-expand b = Breakdown | extend workload = tostring(b.WorkloadKind), cu_ms = coalesce(todouble(b.Utilization.Background), 0.0) + coalesce(todouble(b.Utilization.Interactive), 0.0) | summarize cu_ms = sum(cu_ms) by workload, t = bin(Timestamp, 5m) | order by t asc")
tile("state", "Recent capacity state events", "table", 12, 12, 12, 8,
     f"CapacityState | where {RNG} and {CAP} | project Timestamp, CapacityName, State, InteractiveDelayThresholdPercent, InteractiveRejectThresholdPercent, BackgroundRejectThresholdPercent | order by Timestamp desc | take 50")

# Row 3: who is using it, and open anomalies
tile("ws", "Top workspaces by CU seconds (operation events)", "table", 0, 20, 12, 8,
     "CapacityOperation | where Timestamp between (_startTime .. _endTime) and (tolower(CapacityId) in (toscalar(CapacitySummary | where " + CAP + " | summarize make_set(CapacityId))) or tostring(_capacity) in ('', '[]', '[\"\"]')) | summarize cu_seconds = sum(CuSeconds), operations = count() by WorkspaceName, ItemKind | top 15 by cu_seconds desc")
tile("open", "Anomalies (score above 3)", "table", 12, 20, 12, 8,
     f"CapacitySummary | where {RNG} and {CAP} and AnomalyScore > 3 | project Timestamp, CapacityName, CuPercent, AnomalyScore | order by Timestamp desc | take 100")

PARAM_QUERY = "CapacitySummary | summarize by CapacityName | order by CapacityName asc"


def build():
    ds = uid("datasource")
    page = uid("page")
    queries, tiles = [], []
    for key, title, visual, x, y, w, h, kql in TILES:
        qid = uid("query-" + key)
        queries.append({"id": qid, "dataSource": {"kind": "inline", "dataSourceId": ds}, "text": kql,
                        "usedVariables": ["_startTime", "_endTime", "_capacity"]})
        tiles.append({"id": uid("tile-" + key), "title": title, "visualType": visual, "pageId": page,
                      "layout": {"x": x, "y": y, "width": w, "height": h},
                      "queryRef": {"kind": "query", "queryId": qid}, "visualOptions": {}})
    pq = uid("query-param-capacity")
    queries.append({"id": pq, "dataSource": {"kind": "inline", "dataSourceId": ds}, "text": PARAM_QUERY, "usedVariables": []})
    return {
        "schema_version": "60",
        "autoRefresh": {"enabled": True, "defaultInterval": "30s", "minInterval": "30s"},
        "dataSources": [{"id": ds, "name": KQL_DB, "clusterUri": KQL_URI, "database": KQL_DB_ITEM_ID,
                         "workspace": WORKSPACE_ID, "kind": "kusto-trident", "scopeId": "kusto-trident"}],
        "pages": [{"name": "Capacity break-glass", "id": page}],
        "parameters": [
            {"kind": "duration", "id": uid("param-time"), "displayName": "Time range", "description": "",
             "beginVariableName": "_startTime", "endVariableName": "_endTime",
             "defaultValue": {"kind": "dynamic", "count": DEFAULT_RANGE[0], "unit": DEFAULT_RANGE[1]},
             "showOnPages": {"kind": "all"}},
            {"kind": "string", "id": uid("param-capacity"), "displayName": "Capacity", "description": "",
             "variableName": "_capacity", "selectionType": "array", "includeAllOption": True,
             "defaultValue": {"kind": "all"},
             "dataSource": {"kind": "query", "columns": {"value": "CapacityName"}, "queryRef": {"kind": "query", "queryId": pq}},
             "showOnPages": {"kind": "all"}},
        ],
        "queries": queries,
        "baseQueries": [],
        "tiles": tiles,
    }


def az_token():
    r = subprocess.run(f'az account get-access-token --resource {KQL_URI} --query accessToken -o tsv',
                       capture_output=True, text=True, shell=True)
    if r.returncode != 0 or not r.stdout.strip():
        sys.exit("az token failed; run `az login` in your own terminal")
    return r.stdout.strip()


def run_query(token, csl):
    body = json.dumps({"db": KQL_DB, "csl": csl}).encode()
    req = urllib.request.Request(KQL_URI + "/v1/rest/query", data=body,
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return len(json.load(resp)["Tables"][0]["Rows"]), None
    except urllib.error.HTTPError as e:
        return 0, e.read().decode("utf-8", "replace")[:400]


def check(dash):
    token = az_token()
    prelude = "let _startTime = ago(4h); let _endTime = now(); let _capacity = dynamic([]);\n"
    titles = {t["queryRef"]["queryId"]: t["title"] for t in dash["tiles"]}
    bad = 0
    for q in dash["queries"]:
        rows, err = run_query(token, prelude + q["text"])
        name = titles.get(q["id"], "capacity parameter list")
        print(f"  {'ok  ' if err is None else 'FAIL'} {rows:>4} rows  {name}")
        if err:
            bad += 1
            print("      " + err.replace("\n", " ")[:300])
    return bad


def fab_api(*args):
    r = subprocess.run(["fab", "api", *args], capture_output=True, text=True, shell=True)
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        sys.exit(f"fab api failed: {r.stdout}\n{r.stderr}")


def wait_op(resp):
    import time
    op = (resp.get("headers") or {}).get("x-ms-operation-id")
    if not op:
        return
    for _ in range(40):
        time.sleep(4)
        st = fab_api(f"operations/{op}", "-q", "text")["text"]["status"] if False else \
            fab_api(f"operations/{op}")["text"]["status"]
        print("  status:", st)
        if st == "Succeeded":
            return
        if st == "Failed":
            sys.exit("operation failed: " + json.dumps(fab_api(f"operations/{op}")["text"].get("error")))
    sys.exit("timed out")


def deploy(dash):
    payload = base64.b64encode(json.dumps(dash).encode()).decode()
    parts = [{"path": "RealTimeDashboard.json", "payload": payload, "payloadType": "InlineBase64"}]
    existing = fab_api(f"workspaces/{WORKSPACE_ID}/kqlDashboards")["text"].get("value", [])
    found = next((d for d in existing if d["displayName"] == TITLE), None)
    tmp = os.path.join(os.environ.get("TEMP", "."), "rtd-body.json")
    try:
        if found:
            with open(tmp, "w") as f:
                json.dump({"definition": {"parts": parts}}, f)
            print("updating", found["id"])
            resp = fab_api("-X", "post", f"workspaces/{WORKSPACE_ID}/kqlDashboards/{found['id']}/updateDefinition", "-i", tmp, "--show_headers")
        else:
            with open(tmp, "w") as f:
                json.dump({"displayName": TITLE, "description": "Capacity Insights break-glass view over ci-eventhouse.",
                           "folderId": FOLDER_ID, "definition": {"parts": parts}}, f)
            print("creating", TITLE)
            resp = fab_api("-X", "post", f"workspaces/{WORKSPACE_ID}/kqlDashboards", "-i", tmp, "--show_headers")
        print("  http", resp.get("status_code"))
        wait_op(resp)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    print("dashboard deployed")


def main():
    dash = build()
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "RealTimeDashboard.json"), "w", encoding="utf-8") as f:
        json.dump(dash, f, indent=2)
    print(f"wrote {len(dash['tiles'])} tiles to fabric/rtd/RealTimeDashboard.json")
    if "--check" in sys.argv and check(dash):
        sys.exit(1)
    if "--deploy" in sys.argv:
        deploy(dash)


if __name__ == "__main__":
    main()
