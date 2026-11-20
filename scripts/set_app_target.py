"""Point the Rayfin app at another workspace's Capacity Insights items before deploying it there.

  python scripts/set_app_target.py apps/rayfin/target.json
  python scripts/set_app_target.py apps/rayfin/target.json --check   # show what would change, write nothing

target.json is the block the installer notebook prints at the end:
  { "workspaceId": "...", "workspaceName": "My workspace", "semanticModelId": "...", "dataAgentId": "...",
    "eventstreamId": "...", "eventstreamName": "ci-capacity-overview" }

It rewrites four ids and the workspace label in three files (the semantic model connector in rayfin.yml,
the data agent in the function, and the Eventstream link in the app), and removes the source environment's
deployed app address from the sign-in redirect list. None of these are secrets. `eventstreamId` and `dataAgentId`
may be left empty: the "Add capacity" link and the data agent then will not work, everything else does.
Standard library only.
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
GUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
EMPTY = "00000000-0000-0000-0000-000000000000"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    check = "--check" in sys.argv
    with open(args[0], encoding="utf-8") as f:
        t = json.load(f)
    for key in ("workspaceId", "semanticModelId"):
        if not re.fullmatch(GUID, str(t.get(key) or "")):
            sys.exit(f"{key} is missing or not a GUID in {args[0]}")
    ws, model = t["workspaceId"], t["semanticModelId"]
    agent = t.get("dataAgentId") or EMPTY
    stream = t.get("eventstreamId") or EMPTY
    stream_name = t.get("eventstreamName") or "ci-capacity-overview"
    label = json.dumps(str(t.get("workspaceName") or ""), ensure_ascii=False)
    for key, value in (("dataAgentId", agent), ("eventstreamId", stream)):
        if not re.fullmatch(GUID, value):
            sys.exit(f"{key} is not a GUID in {args[0]}")

    edits = [
        ("apps/rayfin/rayfin/rayfin.yml", [
            # Another environment's deployed address must not stay an allowed sign-in redirect. `rayfin up` adds this one's.
            (r"(?m)^\s*- https://[^\n]*\.fabricapps\.net[^\n]*\n", "", True),
            (rf"(connectors:\s*\n\s*- name: ci-semantic-model\s*\n\s*type: fabric-semanticmodel\s*\n\s*config:\s*\n\s*workspaceId: ){GUID}", rf"\g<1>{ws}"),
            (rf"(connectors:\s*\n\s*- name: ci-semantic-model\s*\n\s*type: fabric-semanticmodel\s*\n\s*config:\s*\n\s*workspaceId: {GUID}\s*\n\s*itemId: ){GUID}", rf"\g<1>{model}"),
        ]),
        ("apps/rayfin/rayfin/functions/src/function_app.ts", [
            (rf"(const WORKSPACE_ID = '){GUID}(')", rf"\g<1>{ws}\g<2>"),
            (rf"(const DATA_AGENT_ID = '){GUID}(')", rf"\g<1>{agent}\g<2>"),
        ]),
        ("apps/rayfin/src/data/rayfin-source.ts", [
            (rf'(const WORKSPACE_ID = "){GUID}(")', rf"\g<1>{ws}\g<2>"),
            (rf'(const EVENTSTREAM_ID = "){GUID}(")', rf"\g<1>{stream}\g<2>"),
            (r'(eventstreamName: ")[^"]*(")', rf"\g<1>{stream_name}\g<2>"),
            # The whole string literal, including any escaped quotes, up to the closing semicolon.
            (r'(export const WORKSPACE_LABEL = )"(?:[^"\\\n]|\\.)*";', lambda m: m.group(1) + label + ";"),
        ]),
    ]
    for rel, subs in edits:
        path = os.path.join(ROOT, *rel.split("/"))
        with open(path, encoding="utf-8") as f:
            text = f.read()
        new = text
        for pattern, repl, *optional in subs:
            new, n = re.subn(pattern, repl, new, count=0 if optional else 1)
            if n != 1 and not optional:
                sys.exit(f"Could not find the expected line in {rel} (pattern: {pattern[:60]}...). The file layout changed; update this script.")
        print(f"{'would update' if check else 'updated':12} {rel}" if new != text else f"{'unchanged':12} {rel}")
        if not check and new != text:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(new)
    if agent == EMPTY:
        print("note: no dataAgentId, so the Ask pane will report an error when used")
    if stream == EMPTY:
        print("note: no eventstreamId, so the 'Open the Eventstream' link in Add capacity will not open the right item")


if __name__ == "__main__":
    main()
