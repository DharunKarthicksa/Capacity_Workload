# 002: Ask AI

Status: **tested, decision pending** (the human decides at the Phase 3 gate)

## Question
Can the app call a Fabric data agent over the KQL database with the signed-in user's identity?

## Finding (2026-11-19)

**The app can call the data agent, but not as the signed-in user.** It calls it as the app identity, which today is the owner of the Fabric app item.

What was tested:

| Step | Result |
| --- | --- |
| Create `ci-data-agent` over `ci-eventhouse` through the REST API, draft and published (`scripts/deploy_data_agent.py`) | Works |
| Ask it a question through its MCP endpoint with a user token (`scripts/ask_data_agent.py`) | Works. Correct numbers, 38 s for one question |
| Rayfin connector for a data agent | Does not exist. Connector types are semantic model, SQL analytics endpoint, SQL database and warehouse |
| Call from the app | Through a Rayfin function (`askDataAgent` in `apps/rayfin/rayfin/functions`), which gets a Fabric token from `ctx.Tokens.Fabric` |
| The deployed function, called from the app | Deployed; not yet confirmed in the browser |

Facts this rests on:

- The Assistants-style endpoint is retired. Learn says to use the MCP endpoint:
  `https://api.fabric.microsoft.com/v1/mcp/workspaces/<ws>/dataagents/<id>/agent` (JSON-RPC over HTTP, one tool, one question argument).
- Rayfin functions call external resources "as the app identity", and "for current Fabric apps, the app identity is the owner of the Fabric app item" (Rayfin docs, Functions, Application authentication).
- The browser side of a Fabric App holds a Rayfin token, not a Fabric API token, so the page cannot call the agent directly.

## Consequences

- **Every app user gets answers with the item owner's access to `ci-eventhouse`.** That is acceptable while the data is capacity-level telemetry and BPA findings. It is not acceptable for anything a user should not see, such as user names per workspace, without a check in the function.
- The MCP endpoint keeps no conversation. Each question is sent on its own, with a "Looking at: screen, capacity, time range" line in front so the agent knows the context.
- Answers take 30 to 60 seconds. The function host limit is 250 seconds.
- Each question uses capacity (Copilot and AI consumption) on the F64.
- The data agent is in preview.

## Options

- **In-app chat (built):** the data agent pane on every screen, through the function above.
- Link out to the data agent in the Fabric portal: the user's own identity applies there, but the screen context is lost.
- Deferred.

## Decision
_Pending; the human decides at the Phase 3 gate. The in-app path is built so it can be judged on real use._

## For the workload (Phase 4)
Not tested. The workload shell should be able to get a Fabric token for the signed-in user from the host and call the same MCP endpoint as that user, which would remove the shared-identity limit there. Confirm this in Phase 4.
