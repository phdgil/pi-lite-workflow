---
name: solar-interview
description: Clarify the user's intention through saved, evidence-grounded answers, current readiness, and explicit closure choices.
---

# Solar Interview

Clarify the user's intended outcome, constraints, and success evidence—not every implementation detail. Keep the original request authoritative. Treat research as evidence, never as a replacement goal or permission. Preserve every saved answer, correction, non-goal, and explicit deferral.

## Each turn

Before asking anything, check the saved answers, current research, and material ledger. Reuse what they already establish. Ask at most one consequential question, and let implementation details wait for planning.

After each answer or research return, call `solar_interview_round` once with:

- `goal`, `constraints`, `success`, and optional `context`: `{score:0..1,evidence:[exact saved-answer IDs],gap:string}`. Scores are advisory only.
- `blockers`: unresolved decisions or conflicts that prevent a valid plan.
- optional `deferred`: `{topic,evidence:[exact answer IDs],reason}` for choices the user explicitly left to planning.
- `intent`, `changeReason`, and optional one-line `question` (at most one question mark).
- `strategy`: `question`, `reframe`, `research`, `ready`, or `blocked`.
- `currentGapId`: required while not ready; name one current material gap or contradiction. Omit it when ready.
- `materialState`:
  - `topics`: `{topicId,kind:"decision"|"correction"|"constraint"|"success",normalizedValue,sourceContentHashes[]}`
  - `gaps`: `{gapId,status:"open"|"narrowed"|"resolved",normalizedSummary}`
  - `claims`: `{gapId,normalizedClaim,sourceContentHashes[]}`
- `readiness`: `{status:"not_ready"|"ready",goalSentence?,materialGaps:[{id,issue,evidenceIds,researchable}],contradictions:[{id,issue,evidenceIds}]}`.

Use exact SHA-256 hashes for the answer or research bytes supplied by the host. IDs and receipt IDs locate provenance but are not information. A new ID, score, URL/title, reworded prose, repeated same-gap answer, duplicate claim, or duplicate source bytes is not progress. A genuinely new or corrected decision, a narrowed/resolved gap, or a relevant new claim backed by different source bytes is progress even when scores stay flat. Identical short text may matter for a different substantive `topicId`; do not discard it globally.

Compact valid example, assuming saved answer `a1` is exactly `Produce an offline comparison report with one cited decision table.` (SHA-256 shown below):

```json
{"goal":{"score":1,"evidence":["a1"],"gap":""},"constraints":{"score":1,"evidence":["a1"],"gap":""},"success":{"score":1,"evidence":["a1"],"gap":""},"blockers":[],"deferred":[],"intent":"Produce an offline comparison report with one cited decision table.","changeReason":"Answer a1 fixes the deliverable, offline constraint, and observable result.","question":"","strategy":"ready","materialState":{"topics":[{"topicId":"deliverable","kind":"decision","normalizedValue":"produce an offline comparison report with one cited decision table","sourceContentHashes":["0a6cd446c695bcd47a4df507676860a010140bd3f6e404c629d242dc091d0ce0"]}],"gaps":[],"claims":[]},"readiness":{"status":"ready","goalSentence":"Produce an offline comparison report with one cited decision table.","materialGaps":[],"contradictions":[]}}
```

## Readiness and closure

Report `ready` only when the current answer and research heads support one goal sentence, at least one material topic, and no blocker, material gap, contradiction, or stale review remains. Use `strategy:"ready"`, an empty question, and omit `currentGapId`. Readiness never closes the interview by itself. The host displays a 12-character token for the current goal; normal closure requires the user to enter the exact `/solar-interview confirm <token>`. Any new answer or research invalidates that token.

`/solar-interview finish` is an explicit **early** finish at any score. It preserves unresolved gaps, contradictions, deferred choices, saved corrections, research, and any unconfirmed goal, and grants planning—not execution—authority. `/solar-interview finish plan-only` also disables execution after planning. Plain `yes`, “enough” or “sufficient,” planning mentions, quotations, hypothetical wording, assistant prose, and `/solar-interview stop` are not confirmation or finish requests.

There is no score threshold, blocker floor, required score decrease, or minimum number of rounds.

## Useful recovery

After one same-gap response with no material information, change strategy: reframe the question or request targeted research. Do not repeat the same wording or manufacture a new ledger record. For a researchable factual gap, call:

```text
solar_revisit({stage:'research',gap:'one named material gap',evidence:'saved answer IDs and the observed reason current evidence cannot resolve it'})
```

The detour must retain the original request, answer/correction history, gap, and research lineage. On return, use new relevant source bytes and a named question rationale, or record truthful blockage. If the distinct reframe/research strategy also yields no material information, report `strategy:"blocked"`; the host pauses with retained answers, artifacts, gap, attempts, and choices to clarify, permit public research, or explicitly finish early.

`/solar-interview continue` requests another useful question, `/solar-interview review` repairs the assessment against the same evidence without claiming progress, and `/solar-interview resume` reopens supported saved state. If runtime tools or the active state version are unsupported, preserve history and explain the actionable pause; never fabricate readiness, percentages, a token, research, or a successful handoff.
