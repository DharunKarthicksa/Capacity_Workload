"""Create or update a notebook in the Capacity Workload folder from fabric/notebooks/<file>.ipynb.

  python scripts/deploy_notebook.py baseline_refresh            # item name ci-baseline-refresh
  python scripts/deploy_notebook.py baseline_refresh --run      # also run it once and wait for the result
  python scripts/deploy_notebook.py baseline_refresh --schedule 60   # hourly schedule (minutes)

Uses `fab api` (flags verified with `fab api --help`) and `fab` job commands. Standard library only.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import time

WORKSPACE_ID = "415f790e-a590-4b59-b30a-c3a70a48de1e"
FOLDER_ID = "b556fb13-1994-4e86-9efc-8039e4b6ed11"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def fab_api(*args):
    r = subprocess.run(["fab", "api", *args], capture_output=True, text=True, shell=True)
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        sys.exit(f"fab api failed: {r.stdout}\n{r.stderr}")


def post(path, body, headers=True):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(body, f)
        name = f.name
    try:
        args = ["-X", "post", path, "-i", name] + (["--show_headers"] if headers else [])
        return fab_api(*args)
    finally:
        os.remove(name)


def wait_op(resp):
    op = (resp.get("headers") or {}).get("x-ms-operation-id")
    if not op:
        return
    for _ in range(60):
        time.sleep(4)
        st = fab_api(f"operations/{op}")["text"]["status"]
        print("  status:", st)
        if st == "Succeeded":
            return
        if st == "Failed":
            sys.exit("operation failed: " + json.dumps(fab_api(f"operations/{op}")["text"].get("error")))
    sys.exit("timed out")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    stem = sys.argv[1]
    name = "ci-" + stem.replace("_", "-")
    with open(os.path.join(ROOT, "fabric", "notebooks", stem + ".ipynb"), "rb") as f:
        payload = base64.b64encode(f.read()).decode()
    definition = {"format": "ipynb", "parts": [{"path": "notebook-content.ipynb", "payload": payload, "payloadType": "InlineBase64"}]}

    items = fab_api(f"workspaces/{WORKSPACE_ID}/notebooks")["text"].get("value", [])
    found = next((n for n in items if n["displayName"] == name), None)
    if found:
        print("updating", name, found["id"])
        resp = post(f"workspaces/{WORKSPACE_ID}/notebooks/{found['id']}/updateDefinition", {"definition": definition})
        item_id = found["id"]
    else:
        print("creating", name)
        resp = post(f"workspaces/{WORKSPACE_ID}/notebooks", {"displayName": name, "folderId": FOLDER_ID, "definition": definition})
        item_id = (resp.get("text") or {}).get("id")
    print("  http", resp.get("status_code"))
    wait_op(resp)
    if not item_id:
        items = fab_api(f"workspaces/{WORKSPACE_ID}/notebooks")["text"].get("value", [])
        item_id = next(n["id"] for n in items if n["displayName"] == name)
    print("notebook", name, item_id)

    if "--run" in sys.argv:
        print("running once")
        resp = post(f"workspaces/{WORKSPACE_ID}/items/{item_id}/jobs/instances?jobType=RunNotebook", {}, headers=True)
        loc = (resp.get("headers") or {}).get("Location", "")
        print("  http", resp.get("status_code"), loc)
        if loc:
            inst = loc.rstrip("/").split("/")[-1]
            for _ in range(60):
                time.sleep(10)
                j = fab_api(f"workspaces/{WORKSPACE_ID}/items/{item_id}/jobs/instances/{inst}")["text"]
                print("  job:", j.get("status"))
                if j.get("status") in ("Completed", "Failed", "Cancelled", "Deduped"):
                    if j.get("status") != "Completed":
                        sys.exit("job did not complete: " + json.dumps(j.get("failureReason")))
                    break

    if "--schedule" in sys.argv:
        minutes = int(sys.argv[sys.argv.index("--schedule") + 1])
        now = time.gmtime()
        start = time.strftime("%Y-%m-%dT%H:%M:%S", now)
        end = "2027-12-31T00:00:00"
        body = {"enabled": True, "configuration": {"type": "Cron", "startDateTime": start, "endDateTime": end,
                                                    "localTimeZoneId": "UTC", "interval": minutes}}
        resp = post(f"workspaces/{WORKSPACE_ID}/items/{item_id}/jobs/RunNotebook/schedules", body, headers=False)
        print("schedule http", resp.get("status_code"), json.dumps(resp.get("text"))[:300])


if __name__ == "__main__":
    main()
