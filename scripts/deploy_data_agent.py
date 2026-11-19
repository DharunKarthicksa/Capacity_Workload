"""Create or update the Fabric data agent `ci-data-agent` over the ci-eventhouse KQL database, and publish it.

  python scripts/deploy_data_agent.py            # create or update, draft and published stages
  python scripts/deploy_data_agent.py --dry-run  # write the definition to fabric/data-agent/ only

The definition format follows the Learn page "Data Agent item definition" (data_agent 2.1.0, dataSource 1.0.0,
stageConfiguration 1.0.0, fewShots 1.0.0). Table and column elements are read from the live KQL schema, so the
agent always matches the database. Uses `az` for the Kusto token and `fab api` for the Fabric REST calls.
Standard library only.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid

WORKSPACE_ID = "415f790e-a590-4b59-b30a-c3a70a48de1e"
FOLDER_ID = "b556fb13-1994-4e86-9efc-8039e4b6ed11"
KQL_DB_ITEM_ID = "32dbe0c2-14e8-4199-8be2-f9e99ccdcfc1"
KQL_URI = "https://trd-3p56kn96phc55ysd7n.z5.kusto.fabric.microsoft.com"
KQL_DB = "ci-eventhouse"
NAME = "ci-data-agent"
SOURCE_DIR = "kusto-" + KQL_DB
SELECTED = {"CapacitySummary", "CapacityState", "CapacityOperation", "AnomalyBaseline", "BpaFindings"}
SCHEMA = "https://developer.microsoft.com/json-schemas/fabric/item/dataAgent/definition/{}/schema.json"
NS = uuid.UUID("c0de0002-0000-4000-8000-00000000ca91")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "fabric", "data-agent")

AI_INSTRUCTIONS = """You are the Capacity Insights assistant for Microsoft Fabric capacity admins. Answer questions about capacity load, throttling risk, anomalies and semantic model health, using only the ci-eventhouse KQL database.

How to answer
- Lead with the answer in one sentence, then at most four short bullets with the numbers behind it. Plain words, no filler.
- Always say which capacity and time window the numbers cover. Name a trial capacity as "the trial capacity", not by its long generated name.
- Timestamps in the data are UTC. If the question gives a "User time zone", convert every time you quote to that zone and say which zone it is. Otherwise quote UTC and say so.
- If the data needed is missing or a table is empty, say that plainly and stop. Never estimate or invent numbers.
- Report only values that come from the columns. Do not make up scores, indexes or ratings of your own.
- Give percentages with a % sign and round to 2 significant digits. Use plain labels ("10-minute throttling window"), not column names.
- The question may start with a line like "Looking at: <screen> · capacity "<name>" (CapacityId <id>) · <time range>. User time zone: <zone>." Use it as the default capacity (filter on CapacityId) and time range.

What the data means
- CapacitySummary has one row per capacity per 30-second window. CuPercent is capacity units used as a percent of the capacity (100 = fully used). InteractivePercent and BackgroundPercent split that total.
- InteractiveDelayThresholdPercent is how full the 10-minute throttling window is. At 100 interactive jobs are delayed. Above 80 is at risk.
- InteractiveRejectionThresholdPercent is the 60-minute window (interactive jobs are rejected at 100). BackgroundRejectionThresholdPercent is the 24-hour window (all jobs are rejected at 100).
- CapacityHourly is not available to you; for long ranges summarize CapacitySummary by bin(Timestamp, 1h).
- OverageCuMs above 0 means the capacity is carrying overage (work it has not paid down yet).
- AnomalyScore is a z-score against the same hour of the week (AnomalyBaseline). Above 3 is an anomaly. It is empty until the baseline has enough history.
- Background work is smoothed over 24 hours, so a job can still be charged long after it ran. The item that is throttled is often not the item that caused the pressure.
- CapacityOperation (per workspace and item) and CapacityState can be empty: those events may not have arrived yet. If asked about workspaces or items and CapacityOperation is empty, say per-workspace data is not available yet.
- BpaFindings holds Best Practice Analyzer findings for semantic models, one row per violation per scan. Use only the latest ScannedAt unless asked for history. Severity is Error, Warning or Info.
"""

SOURCE_INSTRUCTIONS = """Use KQL. Filter CapacitySummary by Timestamp first (for example Timestamp > ago(2h)). CapacityId is a lowercase guid; CapacityName is the display name. For "now" use arg_max(Timestamp, *) by CapacityId. For p95 use percentile(CuPercent, 95). Do not query RawCapacityEvents."""

FEWSHOTS = [
    ("What is the CU utilization right now?",
     "CapacitySummary | where Timestamp > ago(10m) | summarize arg_max(Timestamp, CuPercent, InteractivePercent, BackgroundPercent, InteractiveDelayThresholdPercent) by CapacityName"),
    ("What were the p95 and peak CU in the last 24 hours?",
     "CapacitySummary | where Timestamp > ago(24h) | summarize p95_cu = percentile(CuPercent, 95), peak_cu = max(CuPercent), peak_at = arg_max(CuPercent, Timestamp) by CapacityName"),
    ("Will we throttle in the next hour?",
     "CapacitySummary | where Timestamp > ago(30m) | summarize window_now = arg_max(Timestamp, InteractiveDelayThresholdPercent), window_30m_ago = arg_min(Timestamp, InteractiveDelayThresholdPercent) by CapacityName"),
    ("Show anomalies in the last 24 hours",
     "CapacitySummary | where Timestamp > ago(24h) and AnomalyScore > 3 | project Timestamp, CapacityName, CuPercent, AnomalyScore | order by Timestamp desc"),
    ("Which semantic models should we fix first?",
     "BpaFindings | where ScannedAt == toscalar(BpaFindings | summarize max(ScannedAt)) | summarize errors = countif(Severity == 'Error'), warnings = countif(Severity == 'Warning') by ModelName, WorkspaceName | order by errors desc, warnings desc | take 10"),
    ("Which workspace uses the most CU?",
     "CapacityOperation | where Timestamp > ago(24h) | summarize cu_seconds = sum(CuSeconds), operations = count() by WorkspaceName | top 10 by cu_seconds desc"),
]


def uid(name):
    return str(uuid.uuid5(NS, name))


def az_token(resource):
    r = subprocess.run(f"az account get-access-token --resource {resource} --query accessToken -o tsv",
                       capture_output=True, text=True, shell=True)
    if r.returncode != 0 or not r.stdout.strip():
        sys.exit("az token failed; run `az login` in your own terminal")
    return r.stdout.strip()


def kql_schema():
    body = json.dumps({"db": KQL_DB, "csl": ".show database schema"}).encode()
    req = urllib.request.Request(KQL_URI + "/v1/rest/mgmt", data=body,
                                 headers={"Authorization": "Bearer " + az_token(KQL_URI), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        t = json.load(resp)["Tables"][0]
    cols = [c["ColumnName"] for c in t["Columns"]]
    tables = {}
    for row in t["Rows"]:
        r = dict(zip(cols, row))
        if not r.get("TableName"):
            continue
        tables.setdefault(r["TableName"], [])
        if r.get("ColumnName"):
            tables[r["TableName"]].append((r["ColumnName"], r["ColumnType"]))
    return tables


def element(key, name, kind, selected, children=None, data_type=None):
    e = {"id": uid(key), "is_selected": selected, "display_name": name, "type": kind, "description": None,
         "children": children or []}
    if data_type:
        e["data_type"] = data_type
    return e


def build():
    tables = kql_schema()
    table_elements = []
    for name in sorted(tables):
        sel = name in SELECTED
        cols = [element(f"col-{name}-{c}", c, "kusto.column", sel, data_type=t) for c, t in tables[name]]
        table_elements.append(element("table-" + name, name, "kusto.table", sel, cols))
    datasource = {
        "$schema": SCHEMA.format("dataSource/1.0.0"),
        "artifactId": KQL_DB_ITEM_ID,
        "workspaceId": WORKSPACE_ID,
        "dataSourceInstructions": SOURCE_INSTRUCTIONS,
        "displayName": KQL_DB,
        "type": "kusto",
        "userDescription": "Capacity Insights Eventhouse: 30-second capacity summaries, anomaly baseline and semantic model findings.",
        "metadata": None,
        "elements": [
            element("group-tables", "Tables", "table_grouping", False, table_elements),
            element("group-functions", "Functions", "function_grouping", False),
            element("group-shortcuts", "Shortcuts", "shortcut_grouping", False),
            element("group-mviews", "Materialized Views", "materialized_view_grouping", False),
        ],
    }
    stage = {"$schema": SCHEMA.format("stageConfiguration/1.0.0"), "aiInstructions": AI_INSTRUCTIONS}
    fewshots = {"$schema": SCHEMA.format("fewShots/1.0.0"),
                "fewShots": [{"id": uid("fewshot-" + q), "question": q, "query": k} for q, k in FEWSHOTS]}
    files = {"Files/Config/data_agent.json": {"$schema": SCHEMA.format("dataAgent/2.1.0")},
             "Files/Config/publish_info.json": {"$schema": SCHEMA.format("publishInfo/1.0.0"),
                                                "description": "Capacity Insights data agent over ci-eventhouse."}}
    for stage_name in ("draft", "published"):
        files[f"Files/Config/{stage_name}/stage_config.json"] = stage
        files[f"Files/Config/{stage_name}/{SOURCE_DIR}/datasource.json"] = datasource
        files[f"Files/Config/{stage_name}/{SOURCE_DIR}/fewshots.json"] = fewshots
    selected = [t for t in tables if t in SELECTED]
    print(f"schema: {len(tables)} tables, {len(selected)} selected: {sorted(selected)}")
    return files


def fab_api(*args):
    r = subprocess.run(["fab", "api", *args], capture_output=True, text=True, shell=True)
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        sys.exit(f"fab api failed: {r.stdout}\n{r.stderr}")


def post(path, body):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(body, f)
        name = f.name
    try:
        return fab_api("-X", "post", path, "-i", name, "--show_headers")
    finally:
        os.remove(name)


def wait_op(resp):
    print("  http", resp.get("status_code"))
    if resp.get("status_code") not in (200, 201, 202):
        sys.exit("request failed: " + json.dumps(resp.get("text"))[:600])
    op = (resp.get("headers") or {}).get("x-ms-operation-id")
    if not op:
        return
    for _ in range(60):
        time.sleep(4)
        st = fab_api(f"operations/{op}")["text"]
        print("  status:", st["status"])
        if st["status"] == "Succeeded":
            return
        if st["status"] == "Failed":
            sys.exit("operation failed: " + json.dumps(st.get("error")))
    sys.exit("timed out")


def main():
    files = build()
    for path, content in files.items():
        full = os.path.join(OUT, *path.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8", newline="\n") as f:
            json.dump(content, f, indent=2)
            f.write("\n")
    print(f"wrote {len(files)} definition files to fabric/data-agent/")
    if "--dry-run" in sys.argv:
        return
    parts = [{"path": p, "payload": base64.b64encode(json.dumps(c).encode()).decode(), "payloadType": "InlineBase64"}
             for p, c in files.items()]
    agents = fab_api(f"workspaces/{WORKSPACE_ID}/dataAgents")["text"].get("value", [])
    found = next((a for a in agents if a["displayName"] == NAME), None)
    if found:
        print("updating", NAME, found["id"])
        wait_op(post(f"workspaces/{WORKSPACE_ID}/dataAgents/{found['id']}/updateDefinition", {"definition": {"parts": parts}}))
    else:
        print("creating", NAME)
        wait_op(post(f"workspaces/{WORKSPACE_ID}/dataAgents",
                     {"displayName": NAME, "description": "Capacity Insights data agent over ci-eventhouse.",
                      "folderId": FOLDER_ID, "definition": {"parts": parts}}))
        agents = fab_api(f"workspaces/{WORKSPACE_ID}/dataAgents")["text"].get("value", [])
        found = next((a for a in agents if a["displayName"] == NAME), None)
    print("data agent", NAME, found["id"] if found else "(not listed yet)")


if __name__ == "__main__":
    main()
