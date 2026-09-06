---
name: solar-plan
description: Trigger host-owned, tool-free Solar Max planning and two-role review from current workflow provenance.
---

# Solar Plan

Planning turns the current original request, research, saved interview decisions, corrections, non-goals, deferrals, and relevant source excerpts into a reviewed execution contract. It does not edit product code, install dependencies, authorize execution, or let the calling context certify its own plan.

## Trigger host planning

At an active plan stage, call exactly:

```text
solar_plan_ready({})
```

This is a trigger, not a plan submission or writer. Do not inspect workspace source, author `plan.md`, or supply `path`, `alignment`, `conflicts`, source IDs, context IDs, revisions, findings, or receipts. The host derives the current workflow, input, source, and disk identities; selects and hashes bounded provenance; and owns every role context and artifact write.

If the controller has already surfaced a specific unresolved research or user-decision gap instead of an active planning trigger, use only the narrowest requested detour:

```text
solar_revisit({stage:'research',gap:'specific factual or feasibility gap',evidence:'current evidence and why it is insufficient'})
solar_revisit({stage:'interview',gap:'specific user decision or conflict',evidence:'saved answer/research references and the unresolved choice'})
```

Do not restart the whole workflow or repeat a detour that added no material information.

## Host-owned role cycle

`solar_plan_ready({})` starts this bounded sequence:

1. A fresh tool-free **Planner** session receives only the host-selected provenance bundle and creates the complete current plan.
2. A distinct fresh tool-free **Approach Reviewer** session inspects the full plan. For software it reviews architecture and feasibility; for research it reviews methodology, evidence quality, and document structure.
3. A distinct fresh tool-free **Critic** session inspects whole-plan scope, risk, verification, and acceptance.
4. Every actionable finding is visible and revision-bound. A material finding starts a fresh Planner attempt that returns a complete revised plan plus a resolution mapping from each finding to changed plan locations or `blocked`.
5. After revision, both reviewers inspect the entire new plan again in fresh contexts. Blocked, unresolved, malformed, stale, or failed reviews cannot advance.

All three roles use separate in-memory Pi SDK sessions with no tools or resource discovery, explicit `upstage/solar-pro4`, and `thinkingLevel:"max"`. They are correlated same-model review signals, not independent proof. Their receipts and structural validation do not replace command gates or qualitative human acceptance. SDK session-attempt and repair budgets are reserved before dispatch; deadline, cancellation, invalid output, and exhausted-budget failures pause with visible receipts rather than silently fall back to another model.

## Required ExecutionContractV3

The host Planner must produce a readable `plan.md` containing `Status: ready`, goal/scope, dependency-ordered steps and validation, design/method review, risk revisions, acceptance criteria, remaining uncertainties, and exactly one fenced JSON `ExecutionContractV3` under `## Execution contract`.

The contract has exactly these top-level fields:

```json
{
  "version": 3,
  "domain": "software",
  "requirements": [
    {"id": "R1", "description": "observable requirement", "source": "original request, saved answer, or research reference"}
  ],
  "artifacts": [
    {"id": "A1", "path": "canonical/workspace-relative-output", "kind": "final", "acceptance": "command", "gates": ["G1"]}
  ],
  "capabilities": [
    {"id": "C1", "kind": "write", "tool": "exact_host_tool", "paths": ["canonical/workspace-relative-output"], "commands": []}
  ],
  "steps": [
    {
      "id": "S1",
      "title": "bounded outcome",
      "feasibility": "observed support and remaining assumptions",
      "inputs": [],
      "outputs": ["A1"],
      "actions": ["concrete action"],
      "dependsOn": [],
      "requires": ["R1"],
      "gates": ["G1"],
      "capabilities": ["C1"]
    }
  ],
  "gates": [
    {"id": "G1", "kind": "command", "check": "exact non-destructive command", "pass": "observable condition encoded by command exit", "evidence": ["A1"]}
  ],
  "selfCheck": {
    "review": "scope, ordering, feasibility, risk, and acceptance checked",
    "requirementCoverage": [
      {"requirementId": "R1", "stepIds": ["S1"], "gateIds": ["G1"], "explanation": "how the step and gate cover R1"}
    ],
    "artifactCoverage": [
      {"artifactId": "A1", "stepId": "S1", "gateIds": ["G1"], "explanation": "how A1 is produced and accepted"}
    ],
    "unresolved": []
  }
}
```

Use `domain:"research"` for research/document work. The example is illustrative, not permission to copy generic values.

Contract requirements:

- Use one to 40 meaningful dependency-ordered steps, never padding. Each requirement maps to an actual step and one of that step's gates.
- Every non-evidence artifact has exactly one producer. Every final artifact uses a canonical workspace-relative path, has `command` or `human` acceptance, and is reciprocally bound to its evidence gate.
- Human acceptance requires a qualitative `rubric` gate. Command acceptance requires a non-destructive exact command whose exit status encodes the stated passing condition. A rubric is never disguised as command proof.
- Each step declares exact input/output artifact IDs, requirements, dependencies, actions, feasibility, gates, and capabilities. Produced inputs require a dependency path.
- Every capability names one exact host tool. Read/write capabilities list exact paths and no commands. Command capabilities list the exact approved commands and any affected declared paths. Remove unused or speculative authority.
- `selfCheck` is a coverage map for structural validation, not reviewer authority. It covers every requirement and produced artifact exactly once and leaves no unresolved item hidden in a ready contract.
- Hashes, nonempty prose, or a model's confidence do not establish semantic completeness or feasibility. Reviewers must inspect the full current plan and return actionable, location-specific findings.

## Boundaries

For executable work, a completely reviewed plan stops at `awaiting_gate_review` and exposes only the current reviewed digest. Only the user's exact `/solar-workflow approve <current-token>` authorizes that revision. A later plan or artifact-descriptor change invalidates prior review, checkpoint reuse, approval, final checks, and acceptance authority as applicable.

For planning-only work, the same complete Planner → Approach Reviewer → Critic → revision/re-review cycle runs first. It then stops at `planning_complete` with no approval token, execute tool, or execution follow-up.

Do not claim completion in an ordinary final reply. Planning advances only through the host trigger and its current reviewed state; there is no legacy plan payload, confirm alias, self-review pass, generic-model fallback, or prose-only completion path.
