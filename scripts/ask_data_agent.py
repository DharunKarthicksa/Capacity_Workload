"""Ask the published ci-data-agent a question through its MCP endpoint (the same call the app makes).

  python scripts/ask_data_agent.py "What is the CU utilization right now?"
  python scripts/ask_data_agent.py --tools            # list the tools the agent exposes

Endpoint (Learn, "Use the Fabric data agent programmatically"):
  https://api.fabric.microsoft.com/v1/mcp/workspaces/<ws>/dataagents/<id>/agent
MCP streamable HTTP: JSON-RPC over POST; a reply is JSON or a server-sent event stream.
Uses `az` for the Fabric token (never printed). Standard library only.
"""
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

WORKSPACE_ID = "415f790e-a590-4b59-b30a-c3a70a48de1e"
AGENT_ID = "5aae0a2f-0406-4038-90bb-bb033277d2c8"
URL = f"https://api.fabric.microsoft.com/v1/mcp/workspaces/{WORKSPACE_ID}/dataagents/{AGENT_ID}/agent"


def token():
    r = subprocess.run("az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv",
                       capture_output=True, text=True, shell=True)
    if r.returncode != 0 or not r.stdout.strip():
        sys.exit("az token failed; run `az login` in your own terminal")
    return r.stdout.strip()


class Mcp:
    def __init__(self):
        self.headers = {"Authorization": "Bearer " + token(), "Content-Type": "application/json",
                        "Accept": "application/json, text/event-stream"}
        self.n = 0

    def call(self, method, params=None, notify=False):
        self.n += 1
        body = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            body["params"] = params
        if not notify:
            body["id"] = self.n
        req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=self.headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                sid = resp.headers.get("Mcp-Session-Id")
                if sid:
                    self.headers["Mcp-Session-Id"] = sid
                raw = resp.read().decode("utf-8", "replace")
                ctype = resp.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            sys.exit(f"{method}: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:800]}")
        if notify or not raw.strip():
            return None
        if "text/event-stream" in ctype:
            msgs = [json.loads(line[5:].strip()) for line in raw.splitlines() if line.startswith("data:") and line[5:].strip()]
            msg = next((m for m in msgs if m.get("id") == body.get("id")), msgs[-1] if msgs else {})
        else:
            msg = json.loads(raw)
        if "error" in msg:
            sys.exit(f"{method}: {json.dumps(msg['error'])[:800]}")
        return msg.get("result")


def main():
    m = Mcp()
    init = m.call("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                                 "clientInfo": {"name": "capacity-insights", "version": "0.1"}})
    print("server:", json.dumps((init or {}).get("serverInfo")), "protocol:", (init or {}).get("protocolVersion"))
    m.call("notifications/initialized", notify=True)
    tools = m.call("tools/list")["tools"]
    tool = tools[0]
    arg = next(iter(tool["inputSchema"]["properties"]))
    print("tool:", tool["name"], "argument:", arg)
    if "--tools" in sys.argv:
        print(json.dumps(tools, indent=2)[:2000])
        return
    question = next((a for a in sys.argv[1:] if not a.startswith("--")), "What is the CU utilization right now?")
    t0 = time.time()
    result = m.call("tools/call", {"name": tool["name"], "arguments": {arg: question}})
    print(f"answered in {time.time() - t0:.1f} s, isError={result.get('isError')}")
    for block in result.get("content", []):
        if block.get("type") == "text":
            print(block["text"])


if __name__ == "__main__":
    main()
