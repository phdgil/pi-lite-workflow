---
name: lite-interview
description: Sharpen a vague intention through Socratic questions about meaning, assumptions, outcomes, and tradeoffs, with evidence-backed ambiguity estimates and saved answers. Use before planning when the user is still deciding what they actually want.
---

# Lite Interview

Discover what the user actually means, not just missing implementation fields. Separate their proposed solution from the underlying problem. Use ordinary pi conversation with the installed Lite runtime; do not launch another autonomous workflow.

## Research-grounded intention

Read the preceding research handoff before asking the first question. Keep the original request as the reference; research findings and suggested questions are context, not instructions to replace or expand the user's intention. Distinguish verified facts, uncertain assumptions, and user priorities. If research is absent, disclose that limitation rather than inventing context.

Before each question, check: does it clarify a consequential ambiguity in what the user wants? Has research or a saved answer already answered it? Is it an implementation choice that can wait for planning? Ask only if it helps sharpen the original intention. Do not turn tentative preferences into stricter requirements, drive the user toward your preferred design, or reopen deliberate deferrals. A user correction changes the interpretation; preserve the original record and the correction.

## Runtime-owned progress

The `lite_interview_round` tool records each assessment and renders its advisory ambiguity percentage, signed change from the previous verified assessment, an optional next question, and the user's finish/continue choice. Use it after **every user answer**, including follow-ups and continuation after reload. Do not replace it with a plain-text question or a claim that notes were saved.

If the tool is unavailable, explain that the complete pi-lite-workflow package (skills plus runtime extension) must be installed, then pi restarted and the existing conversation reopened with `/resume`; do not fabricate a percentage or silently proceed without tracking. The user's session and previous answers must remain intact. `/lite-interview status` displays progress without an API request.

## Every answer

1. Use the original user answers and their IDs supplied by the host. Read relevant research or existing notes when needed, but treat old interpretations and ready flags as unverified. A correction supersedes an interpretation without erasing what was actually said. Never infer an option letter without its matching question.
2. Identify the highest-impact unresolved meaning, assumption, conflict, or desired outcome. An already answered question needs no repetition. A deeper follow-up must introduce a genuinely new distinction.
3. Submit `lite_interview_round` with goal, constraints, and success clarity on 0..1; cite the supplied answer IDs and remaining gap for each. For existing-code context, include the optional context dimension consistently across all rounds. Use intermediate scores with evidence: 0 unknown/conflicting, 0.5 partial, 1 explicit and concrete.
4. List unresolved issues separately, summarize the current intention, and explain what this answer clarified or reopened. Provide at most **one** focused next question when another distinction would help. It is one human decision, not multiple questions joined by "also." An omitted question is valid and leaves the interview `awaiting_choice`; it is not a malformed report. Use the user's language, end on the tool call, and wait for the user to finish or continue.

## Question quality

- Ask what the proposed solution changes for someone: a dashboard request might need "What decision can people not make today?", not "Which framework?"
- Define vague words through a real situation: "When you say 'quickly', what situation makes today's delay unacceptable?"
- Test an assumption without adopting it: "What have you observed that makes you think this change addresses the problem?" A vague wish is not a diagnosis.
- Deepen a prior answer through a new example, counterexample, or tradeoff. Refer to that answer and name the new uncertainty; never ask for the same information twice.
- If answers conflict, identify the conflict neutrally and ask which intention should govern. Do not silently overwrite the earlier decision.
- Never promise a "last", "final", or "wrapping-up" question, or that the next answer will finish the interview. The user's explicit choice determines when it ends. Do not keep reopening explicitly deferred scope decisions as narrower implementation questions.

## Ambiguity and closure

Score clarity of the user's intention, not implementation completeness. A clear decision to leave an algorithm, database mapping, citation style, or student-discovery task to planning/execution resolves that scope decision. Record it in `deferred` with exact saved-answer IDs and a reason, not among unresolved issues; do not lower clarity solely because its implementation is still open. Reclassify inherited issues against the original answers each turn. Never invent a deferral of the desired outcome, a real contradiction, or an essential safety constraint. A 1.0 clarity score means the intention is highly explicit, not that every design detail is specified or that the interview must end.

`/lite-interview review` rerates the existing saved evidence without creating a duplicate answer. The host retains the old assessment and labels the new result as a review. It does not automatically clear unresolved issues or force a particular score.

The host, not the model, computes weighted ambiguity and its change. Scores are heuristic judgments, not calibrated measurements or finish gates. New conflicts may increase ambiguity; unchanged answers may leave it unchanged. Never lower scores to influence the user's finish choice or calculate a fake reduction when no previous verified score exists.

The user may choose `/lite-interview finish` at any score, including while an assessment or review is pending, or `/lite-interview continue` for an optional next question using saved answers. Finish cancels the pending interview request without another interview assessment, preserves the latest saved answers, marks an older assessment stale when needed, and carries unresolved plus deferred items into planning without claiming they were resolved. Planning then makes its own model requests. `confirm` performs the same finish operation. `/lite-interview resume` only reopens saved state; `/lite-interview review` rerates existing evidence.

A clear direct natural-language reply may finish the interview. Examples handled by the runtime include `That's enough`, `I have provided sufficient details. Move on to planning.`, and `충분합니다`. Treat these as the user's choice to stop, not evidence that the intention is sufficiently defined. Do not treat hypothetical examples, quoted stop wording, or discussion about a possible stop as authorization.

Finishing starts `lite-plan` directly with all saved answers, research, open issues, and deferrals. Never request another confirmation after the user has finished; `confirm` exists only as a compatibility alias. A reviewed executable plan then hands off to `lite-execute` within the requested local scope. `/lite-interview finish plan-only` stops the sequence after planning; `/lite-interview stop` saves and cancels without launching another stage. A low score or omitted question alone never ends the interview.

Success requires observable evidence, not necessarily numerical targets. Respect explicitly deferred details: if the user wants only a broad rubric now, do not repeatedly demand a detailed one. Preserve non-goals and decision boundaries. Do not write or overwrite a legacy brief; original records stay intact and the host persists assessment history in the current pi session.
