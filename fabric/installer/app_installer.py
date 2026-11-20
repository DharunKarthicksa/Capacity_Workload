# Capacity Insights app installer logic. scripts/build_installer.py embeds this file and the app's source
# into fabric/installer/CapacityInsights_InstallApp.ipynb. It runs in a Fabric Python notebook and deploys
# the Fabric App into the notebook's own workspace, so nobody has to install Node or clone the repository.
#
# What it does: finds the Capacity Insights items in this workspace, downloads Node.js into the notebook's
# temporary disk, unpacks the app source, points it at this workspace's items, builds it, and runs
# `rayfin up` with the notebook user's own token. Nothing is installed on the user's computer.
#
# Expects these names from earlier cells: APP_NAME, PREFIX, FOLDER, WORKSPACE_LABEL, SOURCE_B64.
# Sets APP_RESULT for the summary cell.
import base64
import io
import json
import os
import re
import shutil
import subprocess
import tarfile
import time
import urllib.request

import requests

API = "https://api.fabric.microsoft.com/v1"
WS = notebookutils.runtime.context["currentWorkspaceId"]  # noqa: F821 (provided by the Fabric notebook)
WORK = "/tmp/ci-app"
HOME = "/tmp/ci-home"
T0 = time.time()


def log(step, status, detail=""):
    print(f"[{status:7}] {step}{' - ' + detail if detail else ''}   (+{round(time.time() - T0)} s)")


def fabric_token():
    return notebookutils.credentials.getToken("pbi")  # noqa: F821


def get(path):
    out, url = [], f"{API}/{path}"
    while url:
        r = requests.get(url, headers={"Authorization": f"Bearer {fabric_token()}"}, timeout=120)
        if not r.ok:
            raise RuntimeError(f"GET {path} -> HTTP {r.status_code}: {r.text[:300]}")
        body = r.json()
        if "value" not in body:
            return body
        out += body["value"]
        url = body.get("continuationUri")
    return out


def item_id(kind, name):
    return next((i["id"] for i in get(f"workspaces/{WS}/{kind}") if i["displayName"] == name), "")


# 1. The items this app needs ---------------------------------------------------------------------
ws_name = get(f"workspaces/{WS}").get("displayName", "")
target = {
    "workspaceId": WS,
    "workspaceName": WORKSPACE_LABEL or ws_name,  # noqa: F821
    "semanticModelId": item_id("semanticModels", PREFIX + "semantic-model"),  # noqa: F821
    "dataAgentId": item_id("dataAgents", PREFIX + "data-agent"),  # noqa: F821
    "eventstreamId": item_id("eventstreams", PREFIX + "capacity-overview"),  # noqa: F821
    "eventstreamName": PREFIX + "capacity-overview",  # noqa: F821
}
if not target["semanticModelId"]:
    raise RuntimeError(f"No semantic model named {PREFIX}semantic-model in this workspace. "  # noqa: F821
                       "The data items step above must succeed first.")
log("Items found", "ok", ", ".join(f"{k[:-2]}: {'yes' if v else 'no'}" for k, v in target.items() if k.endswith("Id") and k != "workspaceId"))
if not target["dataAgentId"]:
    print("   note: no data agent found, so the Ask pane will show an error when used. Everything else works.")
if not target["eventstreamId"]:
    print("   note: no Eventstream found, so the 'Open the Eventstream' link in Add capacity will not work.")

# 2. Node.js, into the notebook's temporary disk ---------------------------------------------------
os.makedirs(HOME, exist_ok=True)
node_root = "/tmp/ci-node"
bin_dir = next((os.path.join(node_root, d, "bin") for d in (os.listdir(node_root) if os.path.isdir(node_root) else [])
                if os.path.exists(os.path.join(node_root, d, "bin", "node"))), "")
if not bin_dir:
    index = json.load(urllib.request.urlopen("https://nodejs.org/dist/index.json", timeout=60))
    version = next(v["version"] for v in index if v["version"].startswith("v22.") and v.get("lts"))
    urllib.request.urlretrieve(f"https://nodejs.org/dist/{version}/node-{version}-linux-x64.tar.gz", "/tmp/ci-node.tar.gz")
    os.makedirs(node_root, exist_ok=True)
    with tarfile.open("/tmp/ci-node.tar.gz") as t:
        t.extractall(node_root)
    bin_dir = os.path.join(node_root, f"node-{version}-linux-x64", "bin")
ENV = dict(os.environ, PATH=bin_dir + os.pathsep + os.environ["PATH"], HOME=HOME, CI="true", npm_config_update_notifier="false")


def run(cmd, cwd, what, timeout=1500, env=None, secret=None):
    """Run a command and stop with its last lines if it fails. `secret` is masked in anything printed."""
    p = subprocess.run(cmd, shell=True, cwd=cwd, env=env or ENV, capture_output=True, text=True, timeout=timeout)
    out = (p.stdout or "") + (p.stderr or "")
    if secret:
        out = out.replace(secret, "***")
    if p.returncode != 0:
        tail = "\n".join(line for line in out.strip().splitlines()[-25:] if "npm warn" not in line.lower())
        raise RuntimeError(f"{what} failed (exit {p.returncode}):\n{tail}")
    return out


log("Node.js", "ok", run("node -v", "/tmp", "node").strip())

# 3. App source ------------------------------------------------------------------------------------
shutil.rmtree(WORK, ignore_errors=True)
os.makedirs(WORK)
with tarfile.open(fileobj=io.BytesIO(base64.b64decode(SOURCE_B64)), mode="r:gz") as t:  # noqa: F821
    t.extractall(WORK)
app_dir = os.path.join(WORK, "apps", "rayfin")
with open(os.path.join(app_dir, "target.json"), "w", encoding="utf-8") as f:
    json.dump(target, f)
print(run("python scripts/set_app_target.py apps/rayfin/target.json", WORK, "Pointing the app at this workspace").strip())
log("Source", "ok", "unpacked and pointed at this workspace")

# 4. Dependencies ----------------------------------------------------------------------------------
run("npm install --no-audit --no-fund", WORK, "npm install")
run("npm install --no-audit --no-fund", os.path.join(app_dir, "rayfin", "functions"), "npm install (functions)")
log("Dependencies", "ok")

# 5. Deploy ----------------------------------------------------------------------------------------
token = fabric_token()
deploy_env = dict(ENV, RAYFIN_TOKEN=token, RAYFIN_WORKSPACE_ID=WS)
out = run(f'npx rayfin up --workspace-id {WS} --item-name "{APP_NAME}" -y', app_dir, "rayfin up", env=deploy_env, secret=token)  # noqa: F821
url = (re.search(r"live at:\s*(https://\S+)", out) or re.search(r"Static Hosting URL:\s*(https://\S+)", out))
portal = re.search(r"Portal:\s*(https://\S+)", out)
log("Deploy", "ok", APP_NAME)  # noqa: F821

# 6. Put the app next to the other items ----------------------------------------------------------
try:
    if FOLDER:  # noqa: F821
        folder_id = next((f["id"] for f in get(f"workspaces/{WS}/folders") if f["displayName"] == FOLDER), "")  # noqa: F821
        app_id = next((i["id"] for i in get(f"workspaces/{WS}/items") if i["displayName"] == APP_NAME and i["type"] == "AppBackend"), "")  # noqa: F821
        if folder_id and app_id:
            r = requests.post(f"{API}/workspaces/{WS}/items/{app_id}/move", json={"targetFolderId": folder_id},
                              headers={"Authorization": f"Bearer {fabric_token()}"}, timeout=120)
            log("Folder", "ok" if r.ok else "skipped", FOLDER if r.ok else f"could not move the app (HTTP {r.status_code}); it is in the workspace root")  # noqa: F821
except Exception as e:
    log("Folder", "skipped", f"{str(e)[:160]}; the app is in the workspace root")

shutil.rmtree(WORK, ignore_errors=True)
APP_RESULT = {"url": url.group(1) if url else "", "portal": portal.group(1) if portal else "", "name": APP_NAME}  # noqa: F821
