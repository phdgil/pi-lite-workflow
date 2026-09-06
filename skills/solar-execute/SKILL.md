---
name: solar-execute
description: Execute only the current approved step capabilities, then let host guards run gates, repairs, and fresh final verification.
---

# Solar Execute

Execute only the exact reviewed plan revision authorized by the user's current approval token. A ready plan, old approval, prior checkpoint, progress prose, or matching filenames do not authorize a changed revision, reordered step, wider path, extra command, or external side effect.

The host supplies the one current dependency-ready step and its exact capabilities. Before acting, confirm its declared inputs and dependencies are current. Use only the listed host tools, canonical paths, and exact commands for that step. Do not infer adjacent authority. Preserve unrelated work and credentials; do not install dependencies, commit, publish, destructively roll back, or change external systems unless the approved capability explicitly covers that action and the user separately authorized it where required.

## Execute and report one step

Perform one bounded step. Then call:

```text
solar_step_done({
  stepId: 'S1',
  summary: 'what observable work changed and why it satisfies this step',
  approach: {
    id: 'stable-approach-id',
    description: 'specific method actually used and the evidence it produced'
  },
  evidence: ['canonical/workspace-relative-evidence-path']
})
```

The payload is exact:

- `stepId` is the current step ID supplied by the host, not a guessed alias.
- `summary` describes the actual bounded result. It does not claim gates passed before the host runs them.
- `approach.id` is a stable short identifier and `approach.description` identifies the real method, not merely a new name.
- `evidence` lists current canonical workspace-relative files relevant to the step, including declared outputs or diagnostics. Do not invent evidence, hashes, gate results, approval IDs, or revisions.

Do not supply caller-owned plan, approval, input revision, gate status, or manifest fields. The host reloads fresh workflow state and the disk plan, derives the exact dispatch expectation, and checks workflow, workspace, approval, plan revision, artifact-table revision, current step, tool, path, command, signal, and gate identity. It guards before each gate, immediately before each PowerShell dispatch, and after each result before committing. A stale boundary stops the batch; gate B cannot run after gate A changes authority.

Approved command gates run with the user's permissions and are not a filesystem or shell sandbox. The exact approved command must encode its observable threshold and exit nonzero on failure. Rubric gates capture named evidence but do not turn a qualitative judgment into command proof.

## Failed step and repair

A failed gate, missing output, tool error, or unchanged diagnostic is not completion. Preserve the best artifacts and visible diagnostics. A targeted retry must use a materially different approach and bind the prior failed approach:

```text
solar_step_done({
  stepId: 'S1',
  summary: 'result of the materially different repair',
  approach: {
    id: 'changed-approach-id',
    description: 'what changed in method and what new relevant evidence it produced',
    differsFrom: 'exact-prior-approach-id'
  },
  evidence: ['canonical/current-diagnostic-or-output']
})
```

A fresh ID, reworded description, duplicate command output, or unchanged bytes is not progress. A changed approach must produce a relevant new diagnostic, passing gate, plan resolution, or output bytes. Otherwise the host pauses with the best retained evidence. Repair limits are controller-owned; exhaustion returns to a user decision or replan rather than false completion.

When execution exposes a factual, intent, or feasibility defect, use the narrowest allowed detour and cite current evidence:

```text
solar_revisit({stage:'research',gap:'specific evidence gap',evidence:'current files, gate output, and why the gap matters'})
solar_revisit({stage:'interview',gap:'specific user decision or conflict',evidence:'saved decisions plus current execution evidence'})
solar_revisit({stage:'plan',gap:'specific contract, capability, ordering, or failed-gate defect',evidence:'current gate output, files, and attempted approaches'})
```

Detours preserve original intention, answers, research history, artifacts, and diagnostics. A plan detour creates a new revision requiring full role review and fresh human approval. Do not repeat a no-information detour.

## Final verification

After every step has a passing host record and the host reports that no step remains, request the final boundary with the same exact schema:

```text
solar_step_done({
  stepId: 'final',
  summary: 'request fresh final verification of all declared final artifacts and gates',
  approach: {
    id: 'final-verification',
    description: 'rehash current finals, rerun every approved gate, and compare the post-gate manifest'
  },
  evidence: ['canonical/declared-final-path']
})
```

`stepId:"final"` authorizes verification only; it never re-enables arbitrary step mutation. The host hashes every final artifact before gates, reruns all exact approved gates under final authority, and rehashes finals afterward. A missing or changed file, stale plan, changed descriptor table, failed gate, or manifest mismatch routes to repair/replan and cannot reuse old evidence.

Command-only finals may auto-complete only when every final is command-accepted, every gate passes, no rubric exists, and the pre/post manifests match. Any final with human acceptance or any rubric stops at `awaiting_final_review`. The user must inspect current evidence and use the exact current `/solar-workflow accept <current-token>` or `/solar-workflow revise <feedback>` boundary. Acceptance rehashes final and evidence files; changed bytes invalidate the token.

An ordinary final reply, static `progress.md`, old token, self-reported test result, or generic model judgment cannot complete execution. Host gate records, current manifests, and required human qualitative acceptance are authoritative. Never suppress warnings or failures, and never claim a gate or completion state the host did not commit.
