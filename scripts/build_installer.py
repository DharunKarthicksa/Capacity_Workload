"""Build the one-file installer notebook: fabric/installer/CapacityInsights_Install.ipynb.

  python scripts/build_installer.py

The notebook carries every item definition inside it (KQL schema, semantic model, dashboard, notebooks,
data agent), so the person running it needs no access to this repository. They import the notebook into
their own Fabric workspace and select Run all. The install logic is fabric/installer/installer.py.
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

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
FABRIC = os.path.join(ROOT, "fabric")
OUT = os.path.join(FABRIC, "installer", "CapacityInsights_Install.ipynb")

# The environment the definitions were exported from. The installer replaces these with the target's values.
SOURCE = {
    "workspaceId": "415f790e-a590-4b59-b30a-c3a70a48de1e",
    "cluster": "https://trd-3p56kn96phc55ysd7n.z5.kusto.fabric.microsoft.com",
    "databaseId": "32dbe0c2-14e8-4199-8be2-f9e99ccdcfc1",
    "databaseName": "ci-eventhouse",
}


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


def md(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(True)}


def code(text):
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": text.strip("\n").splitlines(True)}


INTRO = """
# Capacity Insights: install into this workspace

Select **Run all**. The notebook creates the Capacity Insights data items **in the workspace this notebook is in**:

| Item | Name (with the default prefix) |
| --- | --- |
| Eventhouse and KQL database, with the full schema | `ci-eventhouse` |
| Semantic model (DirectQuery over the KQL database) | `ci-semantic-model` |
| Real-Time Dashboard (fallback view) | `ci-capinsights-breakglass` |
| Notebooks, scheduled | `ci-baseline-refresh` (hourly), `ci-bpa-scan` (daily) |
| Data agent | `ci-data-agent` |

**Before you run it**
- The workspace must be on a Fabric capacity. The data agent needs a paid F2 or larger capacity.
- You need Contributor or higher on the workspace.

**It does not create** the Eventstream or set the semantic model's credentials. Both take a few minutes by hand, and the exact steps are printed at the end.

Running it again is safe: existing items are updated, not duplicated. Nothing outside this workspace is touched.
"""

PARAMS = """
# Parameters
PREFIX = "ci-"                 # every item name starts with this
FOLDER = "Capacity Insights"   # workspace folder for the items; "" puts them in the workspace root
INSTALL_DATA_AGENT = True      # set False if the capacity or tenant does not allow data agents
SCHEDULE_NOTEBOOKS = True      # hourly baseline refresh and daily model scan
"""


# The notebook is handed to people in other tenants, so it must not carry our identifiers.
# Each one is swapped for a neutral token here; the installer puts the target's values in.
TOKENS = {
    "workspaceId": "{{CI_WORKSPACE_ID}}",
    "cluster": "{{CI_CLUSTER_URI}}",
    "databaseId": "{{CI_DATABASE_ID}}",
    "databaseName": SOURCE["databaseName"],  # a plain item name, the same in every install with the default prefix
}


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


APP_OUT = os.path.join(FABRIC, "installer", "CapacityInsights_InstallApp.ipynb")
EMPTY_GUID = "00000000-0000-0000-0000-000000000000"
# Our own item ids in the app source. The app notebook must not carry them; set_app_target.py fills in the target's.
APP_SOURCE_IDS = [SOURCE["workspaceId"], "bb213b78-ca1f-4a05-b1e1-bd2e288368c6", "5aae0a2f-0406-4038-90bb-bb033277d2c8",
                  "5eb5b1a1-cc6e-42c0-b246-053bb35e7539"]
APP_SKIP = re.compile(r"^apps/rayfin/(\.agents|scripts|\.vscode)/|\.md$|LICENSE$|\.spec\.|/src/test/|preview\.|\.mcp\.json$|eslint\.config|vitest\.config|\.png$")

APP_INTRO = """
# Capacity Insights: install the app into this workspace

Select **Run all**. It deploys the Capacity Insights app (the eight screens and the Ask pane) as a Fabric App item **in the workspace this notebook is in**. You do not need Node.js, git or the repository on your computer.

**Run the data installer notebook first.** This one looks for the items it created (`ci-semantic-model`, `ci-data-agent`, `ci-capacity-overview`) by name, so keep the same `PREFIX`.

**Before you run it**
- The **Fabric Apps** tenant setting must be on for you.
- You need Contributor or higher on the workspace.
- The notebook needs internet access to download Node.js and the app's packages. That is the default; some tenants restrict it.

It takes about 5 to 10 minutes. It downloads Node.js to the notebook's temporary disk, builds the app there, and deploys it with your own sign-in. Nothing is installed on your computer, and the temporary files go when the session ends.

Running it again redeploys the same app.
"""

APP_PARAMS = """
# Parameters
APP_NAME = "ci-capinsights"    # name of the App item to create or update
PREFIX = "ci-"                 # must match the data installer's PREFIX
FOLDER = "Capacity Insights"   # the app is moved here after deploying; "" leaves it in the workspace root
WORKSPACE_LABEL = ""           # text next to the product name; "" uses this workspace's name
"""


def app_source():
    """The tracked files the app needs to build, as a tar.gz, with our own ids and address removed."""
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


def build_app_notebook():
    source, count = app_source()
    chunks = "\n".join(f'    "{source[i:i + 120]}"' for i in range(0, len(source), 120))
    cell = "# App source, packed. Generated by scripts/build_installer.py; do not edit.\n" f"SOURCE_B64 = (\n{chunks}\n)\n"
    nb = notebook([md(APP_INTRO), code(APP_PARAMS), code(cell), code(read(os.path.join(FABRIC, "installer", "app_installer.py")))])
    with open(APP_OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(nb, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"packed {count} source files into {os.path.relpath(APP_OUT, ROOT)} ({os.path.getsize(APP_OUT) // 1024} KB)")


def notebook(cells):
    return {
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


def main():
    build_app_notebook()
    files = neutralise(collect())
    bundle = base64.b64encode(gzip.compress(json.dumps(files).encode("utf-8"), 9)).decode()
    chunks = "\n".join(f'    "{bundle[i:i + 120]}"' for i in range(0, len(bundle), 120))
    bundle_cell = ("# Item definitions, packed. Generated by scripts/build_installer.py; do not edit.\n"
                   f"SOURCE = {json.dumps(TOKENS)}\nBUNDLE_B64 = (\n{chunks}\n)\n")
    nb = {
        "cells": [md(INTRO), code(PARAMS), code(bundle_cell), code(read(os.path.join(FABRIC, "installer", "installer.py")))],
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
    print(f"packed {len(files)} files ({sum(len(v) for v in files.values()) // 1024} KB) into {os.path.relpath(OUT, ROOT)} "
          f"({os.path.getsize(OUT) // 1024} KB)")
    for k in sorted(files):
        print("  ", k)


if __name__ == "__main__":
    main()
