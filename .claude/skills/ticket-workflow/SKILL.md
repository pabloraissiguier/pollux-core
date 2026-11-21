---
name: ticket-workflow
description: The one-ticket, one-branch, one-PR workflow the api-developer and dashboard-developer agents follow, from claiming a ticket to opening its PR in Spanish with every acceptance criterion checked. Preloaded by both agents.
user-invocable: false
---

# Ticket workflow

You take **exactly one ticket** from claim to PR, then stop and report. The root `CLAUDE.md` (*Working on tickets*) holds the repo rules; this is the sequence.

## 1. Pick and claim

- If you were given a ticket number, use it. Otherwise take the **frontier**: the lowest-numbered open issue with your side's label (`api` or `dashboard`) plus `ready-for-agent`, no assignee, and no open blockers:
  ```bash
  gh issue list --state open --label <side> --label ready-for-agent --json number,title,assignees --jq '.[] | select(.assignees == []) | .number'
  gh api repos/pabloraissiguier/pollux-core/issues/<n> --jq .issue_dependencies_summary.blocked_by   # 0 = startable
  ```
- A ticket labelled for the other side isn't yours: stop and say so.
- If nothing is startable, stop and report which tickets are blocked, and by which open issues.
- Claim it before any other write: `gh issue edit <n> --add-assignee @me`.

## 2. Set up the worktree

You run in your own git worktree, so the other agent's branch never collides with yours.

```bash
git fetch origin
git switch -c <side>/<n>-<short-slug> origin/main     # e.g. api/4-customers, dashboard/14-foundation
pnpm install
docker compose up -d db                                # shared local Postgres on 5433
```

If `pnpm` isn't found, put it on PATH first: `export PATH="${PNPM_HOME:-$HOME/Library/pnpm/bin}:$PATH"`. `.env` is copied into the worktree through `.worktreeinclude`.

## 3. Read before building

Read the ticket and its parent spec (#1 API, #2 dashboard): the spec holds the decisions the ticket depends on. Then read the root `CLAUDE.md`, your workspace's `CLAUDE.md`, `GLOSSARY.md`, and the ADRs in `docs/adr/` that touch the area. Name things with the glossary's English terms in code and its Spanish terms in the UI.

## 4. Build test-first

Use the `tdd` skill. The seams are already agreed in the root `CLAUDE.md` (API: HTTP through the app factory against the local test Postgres; dashboard: Playwright E2E), so start the red → green loop without asking for confirmation. Work in vertical slices, one acceptance criterion at a time. Run single test files as you go and the full suite at the end.

Work found along the way that isn't in the ticket becomes a new issue (`gh issue create --parent <spec> --label <side>`), linked as a blocker where it blocks something. It stays out of this PR.

## 5. Done means

- Every acceptance criterion verified with evidence: a passing test, command output, or a manual check you actually ran.
- Tests, lint and typecheck pass for every workspace you touched.
- The docs stay true: new commands, env vars or conventions go into the relevant `CLAUDE.md` in this PR. New domain terms or hard-to-reverse decisions go into `GLOSSARY.md` or a new ADR (use the `domain-modeling` skill).
- Self-review the diff with the `code-review` skill against the ticket, and fix what it finds.

If a criterion turns out to be wrong or impossible, leave it unchecked, explain why in the PR, and comment on the ticket (`gh issue comment <n>`). Never drop it silently.

## 6. Commit, push, open the PR

- Commit on your branch, ending the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push with `git push -u origin <branch>`.
- Open the PR against `main` with `gh pr create --body-file <file>`. Write the title and body **in Spanish**, using the `pr` skill's template with Spanish headings, plus an acceptance-criteria section:

  ```markdown
  Closes #<n>

  ## Resumen
  <diagram, call tree, file tree or diff sketch, per the pr skill>

  ## Evidencia
  - **Antes:** … **Después:** …   (tests that went red → green, command output)

  ## Criterios de aceptación
  - [x] <each criterion from the ticket, in Spanish, in the ticket's order> (how it was verified)
  - [ ] <only if unmet> (why, and the follow-up issue)

  ## Para revisar
  <decisions the reviewer should look at, and new follow-up issues>

  ## Riesgo del merge
  **Puerta:** de una vía / de dos vías …
  **Alcance:** …

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

  List **every** acceptance criterion from the ticket. Check each box only after verifying it.

## 7. Stop and report

End with: the PR URL, the criteria (checked or not), what the reviewer should look at, and any issues you opened. Then stop: the next ticket is a new run.

## Guardrails

- Leave `main`, merging and closing to the user: never push to `main`, merge a PR or close a ticket yourself.
- The shared Supabase project is read-only for you. Never run `pnpm db:migrate` or `pnpm db:seed` against it, and never write DDL or destructive SQL there. Commit generated migrations, and say in the PR that they need to be applied after merging.
- Write only inside your side's workspaces (see your agent definition). When you need a change on the other side, open an issue for it and say so in the PR.
