# Research -> interview -> plan -> execute

pi-lite-workflow sharpens intention before implementation, then turns that intention into executable, verifiable steps. The four `lite-*` skills share one pi conversation and task folder while the host performs validated stage handoffs. They are designed for tool-capable models, including smaller and medium models, but model reasoning and tool behavior still determine semantic quality.

## 1. Research: establish context before asking

```text
/skill:lite-research Use work/my-task. Investigate <question> using <sources>.
```

Inspect relevant local files, supplied documents, and available source-reading tools. Save `research.md` with `Status: complete` and nonempty `Original intention`, `Evidence`, `Caveats and unknowns`, and `Useful interview questions` sections. `lite_research_ready` reads and structurally validates the existing in-workspace file, then starts the interview. Use `Status: blocked` and stop when essential evidence is unavailable.

Research answers factual questions; it cannot decide the user's values. Missing web-search access is an evidence limitation, not permission to invent citations. The package installs no search service or API key. A later factual gap can trigger another bounded research pass without discarding intentions already stated by the user.

The host carries the original user request and research snapshot as distinct inputs into every interview request and later workflow model call. Source snapshots are labeled untrusted data. A generic pi context hook supplies this context without rewriting arbitrary provider wire payloads. Research can prevent goal drift and repeated factual questions, but it is not a replacement goal, an instruction source, or permission to expand scope. `--research-only` host-enforces the stop even if a model attempts `lite_research_ready`.

## 2. Interview: sharpen meaning and success

Normally the host launches this stage after validating `research.md`. Direct starts are also available:

```text
/lite-interview Help clarify <vague intention>.
/skill:lite-interview Help clarify <vague intention>.
```

The interviewer asks at most one consequential question per turn: what an ambiguous phrase means in a concrete situation, which assumption is supported, which tradeoff matters, or what observable result would meet the need. It should use research and earlier answers instead of requesting the same information again. The user, not the score, decides whether another round is useful.

The `lite_interview_round` tool saves original answers, associated questions, and evidence-linked assessments. After every accepted report, the runtime displays:

- A prominent numbered question in a round-specific color when another useful question is available.
- Current ambiguity and signed change in percentage points as informational estimates.
- What the answer clarified or reopened.
- Whether it is awaiting a finish/continue choice, processing, correcting a malformed report, or stopped.

Clarity scores are model judgments on 0..1. The host computes an ambiguity percentage from dimensions and weights frozen for that interview. New contradictions can increase ambiguity; the initial unassessed state is shown as awaiting assessment rather than assigned an invented score. These numbers are not calibrated uncertainty. A low number does not prove intent is captured, and no score determines whether the user may finish.

Score clarity of the user's intention, not implementation completeness. Choices explicitly delegated to planning, execution, or student discovery belong in evidence-linked `deferred` items. Genuine contradictions and open outcomes remain unresolved. `/lite-interview review` rerates saved evidence without creating another answer, retains the previous assessment, and labels the change as a review rather than new-answer progress. Structural evidence validation cannot guarantee that the model's semantic classification is correct.

After any round, the user may enter `/lite-interview finish` or `/lite-interview continue`. Finish works at **any ambiguity score**, including while an assessment or review is pending. It cancels the pending interview request, preserves saved answers, marks an older assessment stale when needed, and launches planning with unresolved and deferred items intact. It does not request a second confirmation.

A clear direct natural-language instruction can also finish the interview. Recognized examples include `That's enough`, `I have provided sufficient details. Move on to planning.`, and `충분합니다`. The handler records the user's choice; it does not infer that the intention is sufficiently defined. General natural-language interpretation remains model-level, and hypothetical, quoted, or ambiguous mentions of stopping are not finish decisions. `/lite-interview finish plan-only` launches planning without automatic execution. `/lite-interview stop` saves and cancels. `/lite-interview resume` reopens saved state without inference, and `/lite-interview review` rerates existing evidence. The runtime does not overwrite a pre-existing `brief.md`.

## 3. Plan: turn the finished interview into checkable steps

`/lite-interview finish` already starts planning; do not invoke the planner a second time during the normal flow. Use `/skill:lite-plan` directly when requirements are already clear, when deliberately skipping the interview, or when revising an existing plan. Add `--plan-only` to prevent automatic execution.

```text
/skill:lite-plan Use work/my-task and the finished interview in this conversation. Carry unresolved and deferred items into a reviewed plan.
```

The planner reads research, any relevant legacy brief, the user-finished interview handoff, and the minimum project context needed. The latest saved answers override legacy interpretations. Unresolved issues and deferred choices remain explicit inputs instead of being treated as resolved. A still-active interview is not a planning handoff.

| Review function | Purpose |
| --- | --- |
| Planner | Define at most five executable steps, affected outputs/files, dependencies, acceptance conditions, and available validation commands. |
| Design/architect review | Check feasibility, interfaces, dependencies, constraints, and the simplest viable alternative. |
| Critical review | Challenge missing acceptance checks, risks, unsupported assumptions, unnecessary work, and handoff mismatches. |

These are sequential self-review perspectives of **one model**, not independent agents. The skill revises once and writes `plan.md`. To hand off, the file must have `Status: ready`, one to five bounded steps under `Steps and validation`, and nonempty `Goal and scope`, `Design review`, `Risk review and revisions`, `Acceptance criteria`, and `Remaining uncertainties` sections. Numbered lists, bold `Step N` blocks, `Step N` headings, and task-checkbox steps are accepted step formats; examples inside fenced code blocks do not count.

The planner calls `lite_plan_ready` with the plan path, a concise evidence-based alignment statement, and `conflicts`. The host verifies both the plan file and this review report. `conflicts: []` allows automatic execution when the plan aligns with the finished interview and the original request already authorizes the reversible local scope; no additional approval is needed. A nonempty conflicts list blocks automatic execution. Deliberately deferred implementation details are not conflicts by themselves.

The alignment statement and conflicts list are the model's self-review, not independent semantic proof. Host validation confirms required structure and report shape; it does not prove that the model interpreted the interview correctly, and it never expands authorization. This is not GJC's complete Ralplan runtime or a host-enforced consensus protocol.

Actual manual use has covered `/skill:lite-plan` both to skip directly to planning and to replan an existing task. The normal finish path starts planning once and does not require a second planner command.

## 4. Execute: verify the outcome, not a claim

Normally `lite_plan_ready` launches this stage without another confirmation when file validation succeeds, the model reports no interview/plan conflicts, and the original request already authorizes the local work. A direct start remains available:

```text
/skill:lite-execute Implement and verify the reviewed local plan in work/my-task/plan.md within the original requested scope.
```

The execution skill reads the source and tests, writes a bounded checklist, implements the next step, runs the smallest relevant check, and records the outcome in `progress.md`. It attempts one targeted correction after a failure; repeated failure becomes a documented blocker rather than an endless loop. Completion requires recorded acceptance evidence, not checked boxes or model confidence.

A plan file alone is not authorization. The explicit `--plan-only` flag and research/plan ready-tool boundaries are host-enforced, including synthetic attempts to call the tool. Common restrictive phrases are recognized, but arbitrary natural-language restrictions, material-blocker classification, and scope interpretation remain model-level boundaries. Missing permissions, destructive actions, and external-system changes stop automatic continuation. Installing packages, publishing, committing, or changing external systems requires corresponding user authorization. These instructions are not an OS sandbox; use proper isolation for untrusted code.

## Public names and compatibility

| Public v0.3.0 surface | Migration compatibility |
| --- | --- |
| `lite-research`, `lite-interview`, `lite-plan`, `lite-execute` | `/skill:solar-*` runtime aliases remain available; duplicate old skill files are not shipped. |
| `/lite-interview` | `/solar-interview` remains a runtime alias. |
| `lite_research_ready`, `lite_interview_round`, `lite_plan_ready` | Old saved `solar-*` state identifiers remain internal for existing-session compatibility. |

## Handoff and resume

| Artifact | Owner/location | Meaning |
| --- | --- | --- |
| `research.md` | Research skill; current workspace | Original intention, evidence, caveats/unknowns, and useful interview questions; structurally validated before handoff. |
| Original request and research snapshot | Runtime; current pi session | Distinct persistent inputs supplied to interview requests; source content is untrusted data. |
| Interview answers/score history | Runtime; current pi session | Original answers and accepted evidence-linked advisory assessments. |
| Finished interview handoff | Runtime; same conversation | Latest answers and assessment state, including stale status, unresolved issues, and deferred choices. |
| `brief.md`, if present | Existing project artifact | Background only; not silently rewritten or assumed current. |
| `plan.md` | Planning skill; current workspace | Structurally validated reviewed plan; not semantic proof or expanded authorization. |
| `progress.md` | Execution skill; task folder | Authorized scope, verified work, next step, or blocker. |

Keep the same task folder and conversation. Restart pi, then use `/resume` to reopen it. Internal `solar-*` persistence IDs intentionally remain stable for old-session compatibility. In a new conversation, provide and verify an explicit summary of the finished interview plus the relevant research/plan; the package does not import another session's authority automatically. Saved progress is evidence to recheck, not a reason to trust stale completion claims.

For a genuinely changed goal, begin a new task deliberately. The host handoffs do not implement automatic plan invalidation, regression snapshots, continuous experiment keep/revert, or durable multi-goal orchestration.
