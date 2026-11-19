# Branching and commit conventions

## Model: trunk-based with short-lived branches

- `main` is always releasable and is the only long-lived branch. Protect it on GitHub (PR required, no force-push); that setting is a `[YOU]` task.
- Work happens on short-lived branches cut from `main`, merged by pull request (squash merge), then deleted.
- Every branch and PR links a GitHub issue (CLAUDE.md rule 1).

## Branch names

| Pattern | Use |
| --- | --- |
| `phase-<n>/<topic>` | Plan tasks, e.g. `phase-1/foundation`, `phase-2/kql-schema` |
| `ui-fix/<issue>-<slug>` | UI changes; only from `ui-fix` issues, e.g. `ui-fix/42-live-axis` |
| `fix/<issue>-<slug>` | Bug fixes outside the UI |
| `chore/<slug>` | Tooling, CI, dependencies |
| `docs/<slug>` | Documentation only |
| `release/<version>` | Cut only when packaging a workload `.nupkg` (Phase 4+); tag `v<version>` on `main` |

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, imperative, under 72 characters.

- Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`.
- Scopes: `ui`, `rayfin`, `workload`, `kql`, `semantic-model`, `notebooks`, `infra`, `scripts`, `docs`.
- Body explains why. Reference the issue (`Refs #12`, `Closes #12`). Never close `ui-fix` issues from a commit; only the human closes them.
- One logical change per commit. Never commit secrets, tokens or `.env` files (CLAUDE.md rule 6).

## Pull requests

- Small and focused; title follows the commit convention.
- Include the issue link, what changed, how it was verified, and for UI changes a screenshot.
- Squash merge keeps `main` linear.
