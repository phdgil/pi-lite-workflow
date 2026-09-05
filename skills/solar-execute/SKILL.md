---
name: solar-execute
description: Execute an explicitly requested local task or approved plan in small verified steps with a resumable Markdown checklist. Use for lightweight implementation in pi, not open-ended autonomous orchestration.
---

# Solar Execute

Use pi's built-in tools and one progress file. This is a bounded execution checklist, not a background goal engine. Do not launch subagents, call another harness, or create platform goal state.

Use the user's task folder, otherwise `solar-work/<short-task-name>` under the workspace. Read its `plan.md` and `progress.md` when present and relevant to the current task.

The task folder stores notes, not source code. Resolve user-supplied source/test paths from the current workspace unless told otherwise. Read the actual implementation and tests first: a plan is not proof of file locations or interfaces. Current user constraints and existing tests override a plan's assumptions. Correct the checklist within authorized scope rather than replacing or inventing tests to fit an incorrect plan.

For Windows directory discovery, use `Get-ChildItem -LiteralPath . -Force` in powershell, not `ls -la` or Unix paths. Send one command per tool call; do not use `&&` (unsupported by Windows PowerShell 5.1).

1. An explicit user request to implement a named plan authorizes its stated local scope. A plan file alone is not approval. If the user requested planning only, do not implement. Preserve unrelated changes and credentials; do not install packages, commit, publish, or change external systems without the corresponding authorization.
2. Write `progress.md` with at most five current steps and their acceptance checks. On resume, verify recorded completed work still exists; do not repeat successful steps unnecessarily or trust a checkbox over contradictory test results.
3. Implement the next incomplete step using read/edit/write. Keep file operations out of nested shell strings. On Windows prefer the native powershell tool for existing test commands.
4. Run the smallest relevant check. Mark a step done only after its output is verified. On failure, inspect the error and make one targeted correction. If the same step fails again, record the error and set `Status: blocked`; stop rather than guessing more commands.
5. Update progress after each verified step. When every step and final acceptance check pass, set `Status: complete` and report the changed files and actual checks. If checks cannot run, record that gap and do not claim verified completion. On user stop, preserve progress when possible and end the turn.

```markdown
# Progress
Status: running
## Authorized scope
## Checklist
- [ ] Step — acceptance check
## Verification evidence
## Last completed step
## Next step or blocker
```

Use normal Markdown writes, not special state commands. Never claim an edit, save, or test succeeded when its tool returned an error.
