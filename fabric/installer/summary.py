# Last cell of the installer notebook: one summary for the person who ran it.
# Uses RESULT, TARGET, TODO, db, EH_NAME, PREFIX, WS_NAME from the data step and APP_RESULT from the app step.
import requests

events = None
try:  # are capacity events arriving? the app step above took a minute or two, which is usually enough
    r = requests.post(f"{db['cluster']}/v1/rest/query", timeout=60,  # noqa: F821
                      json={"db": db["name"], "csl": "RawCapacityEvents | where ingestion_time() > ago(15m) | count"},  # noqa: F821
                      headers={"Authorization": f"Bearer {notebookutils.credentials.getToken(db['cluster'])}"})  # noqa: F821
    events = r.json()["Tables"][0]["Rows"][0][0] if r.ok else None
except Exception:
    pass

failed = [s for s in RESULT["steps"] if s["status"] == "failed"]  # noqa: F821
app = globals().get("APP_RESULT") or {}
line = "=" * 78
print(line)
print(f"Capacity Insights in workspace '{WS_NAME}'" + (f", folder '{FOLDER}'" if FOLDER else ""))  # noqa: F821
print(line)
print("\nWhat was done")
for s in RESULT["steps"]:  # noqa: F821
    print(f"  [{s['status']:7}] {s['step']}" + (f" - {s['detail']}" if s["detail"] else ""))
if app.get("url"):
    print(f"  [ok     ] App {app['name']}")
elif app.get("error"):
    print("  [failed ] App - see the error printed by the app step above")
elif not INSTALL_APP:  # noqa: F821
    print("  [skipped] App - INSTALL_APP is False")

print("\nCapacity events")
if events is None:
    print("  Could not check. Open the dashboard " + PREFIX + "capinsights-breakglass to see if data is arriving.")  # noqa: F821
elif events > 0:
    print(f"  Arriving: {events} events in the last 15 minutes.")
else:
    print("  None yet. If the Eventstream was set up just now, the first events take about 2 minutes.")

todo = list(TODO)  # noqa: F821
if app.get("error"):
    todo.append("The app was not deployed. The usual causes are the Fabric Apps tenant setting being off, or notebooks "
                "not being allowed to reach the internet. Fix that and run this notebook again; finished steps are skipped or updated.")
print("\nStill to do by hand" if todo else "\nNothing left to do by hand.")
for n, t in enumerate(todo, 1):
    print(f"  {n}. {t}")

print("\nOpen it")
if app.get("url"):
    print(f"  App       : {app['url']}")
    print("              Sign in, then use the Live / Sample switch in the header. Sample shows the full design at once.")
print(f"  Dashboard : {PREFIX}capinsights-breakglass (a plain fallback view of the same data)")  # noqa: F821
if failed:
    print("\nSome steps failed. Copy the [failed] lines above and send them to the person who gave you this notebook.")
print("\nRunning this notebook again is safe. To remove everything, delete the items in the folder.")
