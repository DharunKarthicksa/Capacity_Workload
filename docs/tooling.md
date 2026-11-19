# Tooling

Recorded 2026-11-19 on the dev machine (Windows 11).

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | v26.7.0 | Plan asks for Node LTS; v26 is a Current release, so check Rayfin compatibility before Phase 3 |
| npm | 11.19.0 | |
| Python | 3.11.9 | Plan needs 3.10+ |
| git | 2.53.0.windows.1 | |
| Fabric CLI (`fab`) | 1.8.0 | `pip install ms-fabric-cli` |
| Azure CLI (`az`) | installed, 2 updates pending | Needed from Phase 4 |
| GitHub CLI (`gh`) | **not installed** | Needed for repo, issues and labels (task 1.6) |
| Rayfin | not yet installed | `npm create @microsoft/rayfin@latest` in Phase 3 |

## Authentication

- `fab auth status` confirmed logged in. Sign-in is always done by the user in their own terminal.
- `gh auth login` and `az login`: pending.
