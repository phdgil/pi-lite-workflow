# Changelog

## 0.2.0 - 2026-09-05

- Added host handoffs: a structurally complete `research.md` starts `solar-interview`, user-directed interview finish starts `solar-plan`, and a structurally ready reviewed `plan.md` starts `solar-execute` for the original requested reversible local scope.
- Preserved the original user request and research snapshot as distinct context through every interview request and later handoff. Source snapshots are labeled untrusted data; research is evidence for reducing drift, not a replacement goal or new authorization.
- Made ambiguity strictly advisory: the user may finish at any score through `/solar-interview finish` or a clear natural-language reply, with no second confirmation. `/solar-interview confirm` remains a compatibility alias; `finish plan-only` plans without auto-execution, and `stop` saves/cancels without advancing.
- Added host-enforced `--research-only` and `--plan-only` initial-request boundaries, including rejected synthetic ready-tool attempts. Common explicit phrases such as `Do not implement` and `Planning only` are also recognized; other natural-language scope restrictions remain model-level boundaries.
- Preserved `--plan-only` when invoking `/skill:solar-plan` directly during an active interview, with a regression test for both manual and finish-command routes.
- Added host structural validation for complete research reports and ready reviewed plans with one to five numbered steps and required nonempty sections. This validation is not semantic proof or an OS sandbox.
- Renamed runtime helpers from `.mjs` to `.ts` to avoid the native-ESM cache mismatch observed with pi 0.85.0/jiti. All 65 unit/package tests, the full isolated real-pi smoke, same-process migration/reload cases, restart cases, and targeted `node --check` checks passed without live API use.
- No separate controller package or dependency was added. Research, planning, and execution remain single-model, prompt-guided skills.

Experimental release, tested with pi 0.85.0 on Windows. The `v0.1.0` tag below is unchanged and retains manual stage handoffs.

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
