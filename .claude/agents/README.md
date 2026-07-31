# Project subagents

Reusable Claude Code agents for building out this whiteboard app. Each is a Markdown file with YAML
frontmatter (`name`, `description`, `tools`, `model`) and a body that is the agent's system prompt.
They are project-scoped (committed here), so anyone who clones the repo gets them.

| Agent | Role | Tools | Model |
|-------|------|-------|-------|
| `builder` | Implements a feature/branch (writes app code) | Read, Edit, Write, Grep, Glob, Bash | sonnet |
| `tester` | Runs type-check/build + drives the board in a real browser | Read, Grep, Glob, Bash + `claude-in-chrome` | sonnet |
| `reviewer` | Reviews the branch diff before a PR (read-only) | Read, Grep, Glob, Bash | opus |

## How to use them
- **Automatic:** Claude picks an agent when a task matches its `description`.
- **By name:** ask, e.g. "use the **reviewer** on this branch" or "have the **builder** implement
  Feature 2, then the **tester** verify it."

## Notes
- Each spawn starts with a **cold context** — that's why the project architecture, conventions, and
  the branch-per-feature workflow are written into each agent body rather than assumed.
- The **tester's** browser checks need a **logged-in Chrome session** (the board is behind Supabase
  auth); without one it falls back to type-check/build and says so.
- Only the `builder` can edit code. The `tester` and `reviewer` are read-only by design.
- Editing an agent is a one-line change — e.g. bump a `model:` to `opus` for deeper work.
- After adding/changing these files, a Claude Code session restart may be needed for the new agents
  to appear as selectable subagent types.
