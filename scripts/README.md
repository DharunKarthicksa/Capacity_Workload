# scripts/

One wrapper per phase step for `fab` and `rayfin`. Before first use of any command, run `<cmd> --help` and record the exact flags here (CLAUDE.md rule 3). Use `-f` on `fab import` / `fab export`.

## Verified flags

### `fab api` (fab 1.8.0, from `fab api --help`)

`fab api <endpoint> [-X method] [-i body] [-A audience] [-P k=v,...] [-H k=v,...] [-q jmespath] [--show_headers]`

- Default method is `get`; audience is `fabric` (others: `storage`, `azure`, `powerbi`).
- The JMESPath query runs on the whole response, so response fields sit under `text`, e.g. `-q "text.value[].{name:displayName,id:id}"`.
- Used so far (read-only): `workspaces/<id>/folders`, `workspaces/<id>/folders/<folderId>`, `workspaces/<id>`, `capacities`.
