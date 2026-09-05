---
name: solar-plan
description: Produce a small implementation plan with design and risk self-review, without implementing it. Use in pi after the user finishes clarification, carrying unresolved and deferred items explicitly.
---

# Solar Plan

Use pi's read/write tools. This is ONE model doing sequential self-review, not independent agents or consensus. Do not launch subagents or invoke another harness.

Use the user's task folder, otherwise `solar-work/<short-task-name>` under the current workspace. Preserve unrelated plans. Read the task's `research.md`, its `brief.md` if present, and the few project files needed to understand the requested change. In the research -> interview -> plan workflow, use the user-finished Solar interview handoff in this same pi conversation as the intent specification; a legacy brief does not override the latest saved answers. Carry unresolved issues, deferred choices, and any stale-assessment marker into the plan instead of claiming they were resolved. If the interview is still active rather than user-finished, stop and request an explicit finish decision rather than inventing one.

The task folder stores notes, not source code. Resolve user-supplied source/test paths from the current workspace unless explicitly told otherwise. Read existing source and tests before proposing changes; if a path fails, locate the file rather than assume it must be created. Preserve existing interfaces and tests unless changing them is requested. Current user constraints override a brief's assumptions.

For Windows directory discovery, use `Get-ChildItem -LiteralPath . -Force` in powershell, not `ls -la`, Unix paths, or another shell. Send one command per tool call; do not use `&&` (unsupported by Windows PowerShell 5.1).

1. If an unresolved issue prevents a safe or meaningful plan, ask one question and stop. Otherwise preserve it as an explicit assumption, risk, decision point, or deferred planning task. Do not repeat questions answered in the brief or conversation, and do not reinterpret interview finish as issue resolution.
2. Draft at most five executable steps. Each step names the affected files or output, an observable success condition, and a validation command when one exists. Split a larger task into bounded phases rather than inventing a long procedure.
3. Review the draft from a design perspective: dependencies, interfaces, scope, and the simplest viable alternative.
4. Review it from a critical perspective: likely failures, missing tests, unsafe assumptions, and unnecessary work. Revise the plan once to address the findings.
5. Write the reviewed plan directly to `plan.md`, read it back, and report the path. Stop; do not edit product code or automatically start execution.

```markdown
# Plan
Status: pending approval
Review: single-model self-review, not independent consensus
## Goal and scope
## Steps and validation
## Design review
## Risk review and revisions
## Acceptance criteria
## Remaining uncertainties
```

Do not invent an installed command. On Windows prefer the native powershell tool if needed; use read/write for file operations rather than nested shells or inline JSON. Do not install dependencies, create commits, or change project settings merely to write a plan. Report actual write or validation failures instead of claiming success.
