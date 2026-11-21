---
name: work-tickets
description: Dispatch the api-developer and dashboard-developer agents to tickets, one ticket per agent at a time, each ending in a Spanish PR. Use when the user asks to work on tickets, start or continue the API or dashboard work, or names a ticket number to build.
---

# Work tickets

You are the dispatcher. You route tickets to the two agents and relay their results; the agents write the code. Each agent works one ticket at a time in its own worktree.

| Ticket label | Agent (`subagent_type`) |
|---|---|
| `api` | `api-developer` |
| `dashboard` | `dashboard-developer` |

## 1. Choose the tickets

- **The user named tickets:** route each one by its label (`gh issue view <n> --json labels`). Two tickets for the same side run one after the other, not at the same time.
- **Otherwise, one per side from the frontier:** for `api` and for `dashboard`, take the lowest-numbered open issue labelled `ready-for-agent` with no assignee and no open blockers:
  ```bash
  gh issue list --state open --label <side> --label ready-for-agent --json number,title,assignees --jq '.[] | select(.assignees == []) | "\(.number) \(.title)"'
  gh api repos/pabloraissiguier/pollux-core/issues/<n> --jq .issue_dependencies_summary.blocked_by   # 0 = startable
  ```
  A side with nothing startable gets no agent. Tell the user which of its tickets are blocked, and by which open issues (`gh api repos/pabloraissiguier/pollux-core/issues/<n>/dependencies/blocked_by --jq '.[] | "#\(.number) \(.state)"'`).
- A ticket stays open until its PR is merged, so a blocker with an open PR still blocks.

## 2. Dispatch

For each chosen ticket, call the Agent tool with the side's `subagent_type`, a description like `API #4 Customers`, and a prompt naming the ticket: `Work on ticket #<n>: <title>.` Add any instructions the user gave for it. The agent definitions set the model, the effort and the worktree. Both sides can run at the same time; a side never runs two agents at once.

Tell the user in one line per side what was dispatched, or why a side is idle.

## 3. When an agent finishes

- Relay its report: PR URL, acceptance criteria (checked or not), what to review, any issues it opened. Its report isn't shown to the user, so this is the only way they see it.
- Then dispatch that side's next frontier ticket (step 1), and keep going until the frontier is empty, unless the user asked for a single ticket. Tickets the user still has to merge keep their dependents blocked, so say which merges would unblock the next work.
- If an agent stopped without a PR (blocked, or a failure), report why. Unassign its ticket (`gh issue edit <n> --remove-assignee @me`) unless it's waiting on the user.
