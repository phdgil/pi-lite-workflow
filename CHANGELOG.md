# Changelog

## 0.1.0 - 2026-09-05

First experimental public release for ordinary pi, tested with pi 0.85.0 on Windows.

- Four installable skills: research -> interview -> plan -> execute.
- Interview host with saved original answers, evidence-linked advisory ambiguity estimates, per-round changes, and an explicit user choice to finish or continue at any score.
- Bold, round-colored questions and distinct processing/retry/stopped displays.
- Bounded correction of invalid interview reports without requiring duplicate answers.
- Evidence-linked implementation deferrals and an explicit saved-answer review that rerates existing evidence without creating another answer.
- `/solar-interview finish` ends without a score gate, including during an unassessed request or pending review. It cancels the pending request, preserves the latest answers, marks an older assessment stale when needed, and carries unresolved and deferred items into planning without claiming resolution; `confirm` performs the same finish operation.
- `/solar-interview continue` requests an optional next question from saved answers; `resume` reopens state without inference. A missing next question enters `awaiting_choice` rather than report repair, while malformed evidence still receives bounded correction.
- Closure-honesty guidance and removal of common misleading "last question" introductory labels; explicit commands or clear direct stop replies determine when the interview ends without asserting that the intention is sufficiently defined.
- Solar HTTP 429 delayed retries without a local token/RPM/TPM cap or reasoning downgrade.
- Git-based pi package installation, credential-free model example, workflow guide, validation instructions, and reference/license audit.

Research, planning, and execution remain manually invoked prompt workflows. This release does not bundle the experimental automatic-continuation controller, upstream source archives, or private development sessions. It does not claim independent-agent consensus or proven long-horizon quality improvements.
