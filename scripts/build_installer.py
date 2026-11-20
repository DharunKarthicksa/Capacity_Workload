"""Build the one-file installer notebook: fabric/installer/CapacityInsights_Install.ipynb.

  python scripts/build_installer.py

The notebook carries everything inside it: the item definitions (KQL schema, semantic model, dashboard,
notebooks, data agent) and the app's source. The person running it needs no access to this repository and
nothing installed on their computer. They import the notebook into a Fabric workspace and select Run all.

Logic lives in fabric/installer/: installer.py (data items and Eventstream), app_installer.py (the app),
summary.py (the closing summary). The app source is packed from tracked files, so commit before building.
Standard library only.
"""
import base64
import glob
import gzip
import io
import json
import os
import re
import subprocess
import tarfile
import textwrap

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
FABRIC = os.path.join(ROOT, "fabric")
INSTALLER = os.path.join(FABRIC, "installer")
OUT = os.path.join(INSTALLER, "CapacityInsights_Install.ipynb")

# The environment the definitions were exported from. The notebook is handed to people in other tenants, so it
# must not carry these: each is swapped for a neutral token here, and the installer fills in the target's values.
SOURCE = {
    "workspaceId": "415f790e-a590-4b59-b30a-c3a70a48de1e",
    "cluster": "https://trd-3p56kn96phc55ysd7n.z5.kusto.fabric.microsoft.com",
    "databaseId": "32dbe0c2-14e8-4199-8be2-f9e99ccdcfc1",
    "databaseName": "ci-eventhouse",
}
TOKENS = {
    "workspaceId": "{{CI_WORKSPACE_ID}}",
    "cluster": "{{CI_CLUSTER_URI}}",
    "databaseId": "{{CI_DATABASE_ID}}",
    "databaseName": SOURCE["databaseName"],  # a plain item name, the same in every install with the default prefix
}
EMPTY_GUID = "00000000-0000-0000-0000-000000000000"
# Our own item ids in the app source; set_app_target.py fills in the target's at install time.
APP_SOURCE_IDS = [SOURCE["workspaceId"], "bb213b78-ca1f-4a05-b1e1-bd2e288368c6", "5aae0a2f-0406-4038-90bb-bb033277d2c8",
                  "5eb5b1a1-cc6e-42c0-b246-053bb35e7539"]
APP_SKIP = re.compile(r"^apps/rayfin/(\.agents|scripts|\.vscode)/|\.md$|LICENSE$|\.spec\.|/src/test/|preview\.|\.mcp\.json$|eslint\.config|vitest\.config|\.png$")

INTRO = """
# Capacity Insights: install into this workspace

**Select Run all.** In about 5 minutes this notebook sets up Capacity Insights in the workspace it is in:

| | What you get |
| --- | --- |
| Data | An Eventhouse with the full schema, and an Eventstream that feeds it with this workspace's capacity events |
| Model and views | A semantic model and a fallback Real-Time Dashboard |
| Jobs | Two scheduled notebooks: an hourly anomaly baseline and a daily model scan |
| Ask | A data agent over the Eventhouse |
| App | The Capacity Insights app: eight screens and the Ask pane |

**Before you run it**
- The workspace is on a Fabric capacity, and you are Contributor or higher on it.
- To monitor a capacity you must be an admin of it. By default the notebook monitors the capacity this workspace runs on.
- For the app, the Fabric Apps tenant setting is on for you.

**When it finishes**, the last cell lists what was created, the app address, and anything left to do by hand. Normally that is one thing: signing in once on the semantic model.

Nothing is installed on your computer and nothing outside this workspace is changed. Running it again is safe: finished parts are updated, not duplicated.
"""

PARAMS = """
# Settings. The defaults are fine for a first run.
PREFIX = "ci-"                 # every item name starts with this
FOLDER = "Capacity Insights"   # workspace folder for the items; "" puts them in the workspace root
MONITOR_CAPACITY_ID = ""       # capacity to monitor; "" means the capacity this workspace runs on
INSTALL_APP = True             # needs the Fabric Apps tenant setting and internet access from notebooks
INSTALL_DATA_AGENT = True      # skipped automatically on a trial capacity
SCHEDULE_NOTEBOOKS = True      # hourly baseline refresh and daily model scan
APP_NAME = PREFIX + "capinsights"
WORKSPACE_LABEL = ""           # text next to the product name in the app; "" uses this workspace's name
"""

APP_WRAPPER = """# The app: built in this notebook's temporary disk and deployed with your own sign-in.
APP_RESULT = {{}}
if INSTALL_APP:
    try:
{body}
    except Exception as e:
        APP_RESULT = {{"error": str(e)}}
        print("[failed ] App")
        print(str(e)[:3000])
else:
    print("[skipped] App - INSTALL_APP is False")
"""


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def collect():
    files = {"kql/schema.kql": "\n\n".join(read(p).strip() for p in sorted(glob.glob(os.path.join(FABRIC, "kql", "0*.kql"))))}
    model = os.path.join(FABRIC, "semantic-model", "ci-semantic-model.SemanticModel")
    for base, prefix in ((model, "semantic-model/"), (os.path.join(FABRIC, "data-agent"), "data-agent/")):
        for dirpath, _, names in os.walk(base):
            for n in names:
                full = os.path.join(dirpath, n)
                files[prefix + os.path.relpath(full, base).replace(os.sep, "/")] = read(full)
    files["rtd/RealTimeDashboard.json"] = read(os.path.join(FABRIC, "rtd", "RealTimeDashboard.json"))
    for stem in ("baseline_refresh", "bpa_scan"):
        files[f"notebooks/{stem}.ipynb"] = read(os.path.join(FABRIC, "notebooks", stem + ".ipynb"))
    return files


def neutralise(files):
    out = {}
    for path, text in files.items():
        for key in ("workspaceId", "cluster", "databaseId"):
            text = text.replace(SOURCE[key], TOKENS[key])
        out[path] = text
    leftovers = sorted({path for path, text in out.items() for key in ("workspaceId", "cluster", "databaseId")
                        if SOURCE[key].split("//")[-1].split(".")[0] in text})
    if leftovers:
        raise SystemExit(f"source identifiers are still present in: {leftovers}")
    return out


def app_source():
    """The tracked files the app needs to build, as a tar.gz, with our own ids, address and label removed."""
    listed = subprocess.run(["git", "ls-files", "package.json", "package-lock.json", "packages/ui", "apps/rayfin", "scripts/set_app_target.py"],
                            cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    names = [n for n in listed if n and not APP_SKIP.search(n)]
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", compresslevel=9) as tar:
        for name in names:
            with open(os.path.join(ROOT, *name.split("/")), "rb") as f:
                data = f.read()
            if name.endswith(("rayfin.yml", "rayfin-source.ts", "function_app.ts")):
                text = data.decode("utf-8")
                for guid in APP_SOURCE_IDS:
                    text = text.replace(guid, EMPTY_GUID)
                text = re.sub(r"(?m)^\s*- https://[^\n]*\.fabricapps\.net[^\n]*\n", "", text)
                text = re.sub(r'(export const WORKSPACE_LABEL = )"(?:[^"\\\n]|\\.)*";', r'\1"";', text)
                data = text.encode("utf-8")
            for marker in APP_SOURCE_IDS + ["fabricapps.net", SOURCE["cluster"].split("//")[1].split(".")[0], "SE&I"]:
                if marker.encode() in data and not name.endswith("package-lock.json"):
                    raise SystemExit(f"source identifier '{marker}' is still present in {name}")
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mtime = 0
            tar.addfile(info, io.BytesIO(data))
    return base64.b64encode(buf.getvalue()).decode(), len(names)


def md(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(True)}


def code(text):
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": text.strip("\n").splitlines(True)}


def packed(name, value):
    chunks = "\n".join(f'    "{value[i:i + 120]}"' for i in range(0, len(value), 120))
    return f"{name} = (\n{chunks}\n)\n"


def main():
    files = neutralise(collect())
    bundle = base64.b64encode(gzip.compress(json.dumps(files).encode("utf-8"), 9)).decode()
    source, count = app_source()
    app_body = textwrap.indent(read(os.path.join(INSTALLER, "app_installer.py")).rstrip("\n"), " " * 8)
    cells = [
        md(INTRO),
        code(PARAMS),
        code("# Item definitions and app source, packed. Generated by scripts/build_installer.py; do not edit.\n"
             f"SOURCE = {json.dumps(TOKENS)}\n" + packed("BUNDLE_B64", bundle) + packed("SOURCE_B64", source)),
        code(read(os.path.join(INSTALLER, "installer.py"))),
        code(APP_WRAPPER.format(body=app_body)),
        code(read(os.path.join(INSTALLER, "summary.py"))),
    ]
    nb = {
        "cells": cells,
        "metadata": {
            "kernel_info": {"name": "jupyter"},
            "kernelspec": {"name": "jupyter", "display_name": "Jupyter"},
            "language_info": {"name": "python"},
            "microsoft": {"language": "python", "language_group": "jupyter_python"},
            "dependencies": {},
        },
        "nbformat": 4, "nbformat_minor": 5,
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(nb, f, indent=1, ensure_ascii=False)
        f.write("\n")
    old = os.path.join(INSTALLER, "CapacityInsights_InstallApp.ipynb")
    if os.path.exists(old):
        os.remove(old)
    print(f"packed {len(files)} definitions and {count} app source files into {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
