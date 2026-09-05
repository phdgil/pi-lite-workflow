---
name: solar-research
description: Investigate a bounded question using local data or available source-reading tools and save an evidence-backed Markdown verdict. Use for research rather than product implementation in pi.
---

# Solar Research

Use pi's ordinary tools and one Markdown report. No mission CLI, goal API, subagents, structured verdict commands, or automatic implementation.

Use the user's task folder, otherwise `solar-work/<short-task-name>` under the workspace. Read an existing `research.md` only if it belongs to this question.

The task folder stores notes, not the project inputs. Resolve supplied data/script paths from the current workspace unless told otherwise. On Windows, list files with `Get-ChildItem -LiteralPath . -Force` in powershell; do not use `ls -la` or Unix paths. Send one command per tool call; do not use `&&` (unsupported by Windows PowerShell 5.1).

1. Identify the question, available evidence, constraints, and completion criterion. Use information already provided; ask one question only if a missing decision prevents useful research.
2. Choose a small evidence plan. For local experiments, inspect the supplied data or benchmark before running it. Use existing commands unchanged; do not rewrite product code or a benchmark to obtain a favorable result. Default to at most three experiment runs, or the user's lower limit.
3. Gather and check evidence. On Windows prefer the native powershell tool for a short command such as `python benchmark.py`. Do not put large JSON or scripts inside shell command strings. After an error, read the message and try one correction; if the same step still fails, record the blocker instead of looping.
4. Separate what the evidence shows from inference and unknowns. Never invent web search or citations. Use web tools only if actually available; otherwise use supplied sources/local evidence and explicitly record the web-research limitation.
5. Write `research.md` directly with the write tool, read it back, then give the conclusion and path. A useful inconclusive verdict is preferable to fabricated certainty. Stop without switching workflows.

```markdown
# Research
Status: complete
Verdict: supported / unsupported / inconclusive
## Question and scope
## Evidence
## Method and observed results
## Conclusion
## Caveats and unknowns
```

Set `Status: blocked` if essential evidence cannot be collected. Evidence entries include a file or source URL, the command when relevant, its observed outcome, and limitations. Do not confuse a successful calculation with verification of a broader claim. Do not label the report saved if writing failed.
