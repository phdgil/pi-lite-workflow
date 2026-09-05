# Research -> interview -> plan -> execute

The purpose is to sharpen intention before implementation, then turn it into executable, verifiable steps. In **v0.2.0**, the four single-model, prompt-guided skills share one pi conversation and task folder while the host performs validated stage handoffs. The older `v0.1.0` tag remains a manual four-skill workflow.

## 1. Research: establish context before asking

`/skill:solar-research Use solar-work/my-task. Investigate <question> using <sources>.`

Inspect relevant local files, supplied documents, and available source-reading tools. Save `research.md` with `Status: complete` and nonempty `Original intention`, `Evidence`, `Caveats and unknowns`, and `Useful interview questions` sections. `solar_research_ready` reads and structurally validates the existing in-workspace file, then starts `solar-interview`. Use `Status: blocked` and stop when essential evidence is unavailable.

Research answers factual questions; it cannot decide the user's values. A missing web-search tool is an evidence limitation, not permission to invent citations. No web-search service or API key is installed by this package. A later factual gap can trigger another bounded research pass without discarding intentions already stated by the user.

The host carries both the original user request and the research snapshot into every interview request. Source snapshots are labeled untrusted data. Research is evidence for avoiding drift and repeated factual questions; it is not a new goal, an instruction source, or permission to expand scope. `--research-only` on the initial skill request host-enforces the stop even if a model attempts `solar_research_ready`.

## 2. Interview: sharpen meaning and success

Normally the host launches this stage after validating `research.md`. A direct start remains available:

`/skill:solar-interview Help clarify <vague intention>.`

The interviewer asks at most one consequential question per turn: what an ambiguous phrase means in a concrete situation, which assumption is supported, which tradeoff matters, or what observable result would meet the need. It should refer to earlier answers rather than requesting the same information again. The user, not the score, decides whether another round is useful.

The runtime saves original answers, their associated questions, and evidence-linked assessments in pi's session. After every accepted report it displays:

- A prominent numbered question in a round-specific color when another useful question is available.
- Current ambiguity and signed change in percentage points as informational estimates.
- The explanation of what this answer clarified or reopened.
- Whether it is your turn, awaiting a finish/continue choice, processing, correcting a malformed report, or stopped.

Clarity scores are model judgments on 0..1. The host computes an ambiguity percentage from frozen dimensions and weights for that interview. New contradictions can increase ambiguity; the initial unassessed state is shown as awaiting assessment, not an invented measured score. The number is advisory and never determines whether the user may finish.

These numbers are a tracking heuristic, not calibrated uncertainty. The model can still misunderstand an answer or ask an unhelpful follow-up. A low number alone does not prove intent is captured.

Score clarity of the user's intention, not implementation completeness. Choices explicitly left to student discovery or later design belong in evidence-linked `deferred` items, while genuine contradictions and open outcomes remain unresolved. `/solar-interview review` rerates the same saved evidence, retains the previous assessment, and labels the change as a review rather than new-answer progress. The host validates evidence IDs and exact classification conflicts; it cannot guarantee the model's semantic classification is correct.

After every round, the user may enter `/solar-interview finish` or `/solar-interview continue`. Finish works at **any ambiguity score**, including while an assessment or review is pending: it cancels the pending request, preserves the latest saved answers, marks an older assessment stale when needed, and launches `solar-plan` with unresolved and deferred items intact. No second confirmation is requested. `/solar-interview confirm` is a compatibility alias only. Continue asks for an optional next question using saved answers; when no question is supplied, the valid state is `awaiting_choice`, not an automatic repair loop. Malformed evidence and other invalid tool reports still receive bounded repair.

A clear direct natural-language instruction can also finish the interview and launch planning. Recognized examples include `That's enough`, `I have provided sufficient details. Move on to planning.`, and `충분합니다`. The handler records the user's choice; it does not infer that the intention is sufficiently defined. Hypothetical examples, quoted commands, or discussion about whether to stop are not finish decisions. `/solar-interview finish plan-only` launches planning but disables automatic execution. `/solar-interview stop` saves and cancels without launching another stage. `/solar-interview resume` reopens the saved state without generating a question; `/solar-interview review` rerates existing evidence. The runtime does not overwrite a pre-existing `brief.md`.

## 3. Plan: turn the finished interview into checkable steps

`/solar-interview finish` already starts this stage; do not invoke it a second time. Use `/skill:solar-plan` directly for clear existing requirements, to skip interviewing deliberately, or to revise a plan. Add `--plan-only` to stop before execution. `/solar-plan` is not a registered command.

Normally interview finish launches this stage. A direct start remains available:

`/skill:solar-plan Use solar-work/my-task and the finished interview in this conversation. Carry unresolved and deferred items into a reviewed plan.`

The packaged planner reads research, any relevant legacy brief, the current user-finished interview handoff, and the minimum project context needed. The latest saved answers override legacy interpretations. Unresolved issues and deferred choices remain explicit planning inputs rather than being treated as resolved. A still-active interview is not a planning handoff.

| Review function | Purpose |
| --- | --- |
| Planner | Define at most five current executable steps, affected outputs/files, dependencies, acceptance conditions, and available validation commands. Split larger work into bounded phases. |
| Design/architect review | Check feasibility, interfaces, dependencies, constraints, and the simplest viable alternative. A correct plan must be technically possible, not merely aligned in wording. |
| Critical review | Challenge missing acceptance checks, risks, unsupported assumptions, unnecessary work, and mismatches with the finished interview handoff. |

These are sequential self-review perspectives of **one model**, not independent agents. The skill revises once and writes `plan.md`. To hand off, the in-workspace file must have `Status: ready`, one to five numbered entries under `Steps and validation`, and nonempty `Goal and scope`, `Design review`, `Risk review and revisions`, `Acceptance criteria`, and `Remaining uncertainties` sections. `solar_plan_ready` validates that structure and launches `solar-execute` only for the original requested, reversible local scope. This is not GJC's complete Ralplan runtime or a host-enforced consensus protocol.

## 4. Execute: verify the outcome, not a claim

Normally `solar_plan_ready` launches this stage without another confirmation when the original request already authorizes the local work. A direct start remains available:

`/skill:solar-execute Implement and verify the reviewed local plan in solar-work/my-task/plan.md within the original requested scope.`

The execution skill reads the actual source and tests, writes a bounded checklist, implements the next step, runs the smallest relevant check, and records the outcome in `progress.md`. It attempts one targeted correction after a failure; repeated failure becomes a documented blocker rather than an endless loop. Final completion requires recorded acceptance evidence, not just checked boxes or model confidence.

A plan file alone is not authorization and structural validation is not semantic proof. The `--plan-only` flag and research/plan ready-tool boundaries are host-enforced, including synthetic model attempts to call the tool. Plain-language research-only or planning-only restrictions, material-blocker classification, and scope interpretation remain model-level boundaries. Missing permissions, destructive actions, and external-system changes stop automatic continuation. Installing packages, publishing, committing, or changing external systems requires corresponding user authorization. These instructions are not an OS sandbox; use proper isolation for untrusted code.

## Handoff and resume

| Artifact | Owner/location | Meaning |
| --- | --- | --- |
| `research.md` | Research skill; current workspace | Original intention, evidence, caveats/unknowns, and useful interview questions; structurally validated before handoff. |
| Original request and research snapshot | Runtime; current pi session | Distinct persistent inputs supplied to every interview request to reduce goal drift; source content is untrusted data. |
| Interview answers/score history | Runtime; current pi session | Original answers and accepted evidence-linked advisory assessments. |
| Finished interview handoff | Runtime; same pi conversation | Latest saved answers and assessment state, including stale status, unresolved issues, and deferred choices. |
| `brief.md`, if already present | Existing project artifact | Background only; not silently rewritten or assumed current. |
| `plan.md` | Planning skill; current workspace | Structurally validated reviewed plan; not independent semantic proof or expanded authorization. |
| `progress.md` | Execution skill; task folder | Authorized scope, verified work, next step/blocker. |

Keep the same task folder and conversation. Restart pi then `/resume` to reopen it. In a new conversation, provide and verify an explicit summary of the user-finished interview plus the relevant research/plan; the package does not automatically import another session's authority or intent. Saved progress is evidence to recheck, not a reason to trust stale completion claims.

For a genuinely changed goal, begin a new task deliberately. The host handoffs do not implement automatic plan invalidation, regression snapshots, continuous experiment keep/revert, or durable multi-goal orchestration.
