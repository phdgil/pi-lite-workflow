# pi-solar-lite

**Research the context. Sharpen the intention. Plan executable steps. Verify the result.**

Four lightweight skills and an interview/runtime extension for [pi](https://github.com/earendil-works/pi), developed while testing **Upstage Solar Pro4 Max**. The goal is not merely to keep a model running: it is to turn a vague request into a documented intention, a workable plan, and evidence that the work meets the user's chosen outcome.

**v0.2.0 is experimental.** It adds host handoffs between stages and fixes helper-module reload errors. Testing targets pi 0.85.0 on Windows; other models and operating systems are not yet validated. This is an independent community package, not an official Upstage, pi, GJC, or OMX release.

## Why this exists

A useful interview should uncover what the user means, not ask a context-free checklist of implementation questions. Research first helps distinguish facts the agent can find from priorities only the user can decide. The interview then explores assumptions, ambiguous words, tradeoffs, and observable success until the user chooses to finish. Planning turns that user-ended interview, including any unresolved issues and deferred choices, into small, checkable steps; execution checks the result instead of treating a confident answer as completion.

The model-facing instructions stay small. The host handles interview state, score arithmetic, recovery, and display. This reduces workflow bookkeeping, but does **not** guarantee better reasoning or eliminate repeated questions.

## Install into pi

Requires Node.js **22.19+**, Git on PATH, pi, and your own authorized model access. No Codex account, GJC installation, or other community controller is required.

If pi is not installed, the tested version is:

```powershell
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.0
```

Install the published release from PowerShell or your terminal:

```powershell
pi install git:github.com/phdgil/pi-solar-lite@v0.2.0
pi
```

This installs **both** the four skills and the runtime extension. Copying only `SKILL.md` is not sufficient. See the [installation guide](docs/INSTALL.md) for upgrades and local installation. After installation or an update, restart pi; use `/resume` to reopen an existing conversation.

Inside pi, authenticate with `/login`, choose `upstage/solar-pro4` with `/model`, and select `max` with `/thinking`. Ctrl+S in each picker saves the startup default, so normal launches need only `pi`. If Solar or Max is missing, follow the [installation and credential-free model setup guide](docs/INSTALL.md), rather than pasting credentials into this repository.

## The sequence

**Research → interview → plan → execute** is a same-conversation workflow with validated host handoffs. The older `v0.1.0` tag remains manual at every stage.

| Stage | Command inside pi | Purpose and handoff |
| --- | --- | --- |
| 1. Research | `/skill:solar-research` | Collect context and save a structurally complete `research.md`; `solar_research_ready` validates it and starts the interview. |
| 2. Interview | launched by the host, or `/skill:solar-interview` | Sharpen the original request using the research snapshot as evidence, not as a replacement goal. The user may finish at any ambiguity score. |
| 3. Plan | launched by interview finish | Use the original request, research, saved answers, unresolved issues, and deferrals to write and review `plan.md`. |
| 4. Execute | launched after `solar_plan_ready` | Execute only the original requested, reversible local scope; verify each step and record results/blockers in `progress.md`. |

Example: use the same task folder and pi conversation throughout.

```text
/skill:solar-research Use solar-work/study-helper. I want a local study guide that helps students choose an analysis method. Research the supplied course materials and existing tools, clarify my intention, then plan, create, and verify the guide. Preserve source materials and unrelated files.
```

When `research.md` has `Status: complete` and nonempty `Original intention`, `Evidence`, `Caveats and unknowns`, and `Useful interview questions` sections, the host starts `solar-interview`. The original request and research snapshot remain available on every interview request, so research can prevent repeated factual questions without silently becoming a new goal.

After each round, the score is informational and you can either finish or continue. You may also finish while an assessment or review is pending, even if the display still lists unresolved issues:

```text
/solar-interview finish
```

`finish`, or a clear natural-language equivalent, starts planning immediately with no second confirmation. `/solar-interview confirm` remains only a compatibility alias. A reviewed `plan.md` with `Status: ready`, one to five numbered steps, and all required sections starts execution automatically when the original request already authorizes that reversible local work. Material blockers, missing permissions, destructive/external work, and research-only or planning-only constraints stop the sequence.

Use `--research-only` on the initial skill request to stop after research, or `--plan-only` to disable the plan-to-execute handoff. These flag boundaries and the research/plan file validators are host-enforced, including when a model attempts the ready tool anyway. Equivalent plain-language research-only or planning-only restrictions remain prompt-level boundaries. `/solar-interview finish plan-only` starts planning but disables automatic execution. `/solar-interview stop` saves and cancels without launching another stage.

The planner's design/architect and critic passes are **one model's sequential self-review**, not independent-agent consensus. See the [workflow and handoff guide](docs/WORKFLOW.md) for roles, saved artifacts, completion conditions, and limitations.

### When to call the planner directly

Normally, do not call it again after `/solar-interview finish`: planning has already started. Use `/skill:solar-plan` when requirements are already clear, when deliberately skipping the interview, or when revising an existing plan. The command is `/skill:solar-plan`, not `/solar-plan`.

For a planning-only review: `/skill:solar-plan --plan-only Review and revise solar-work/my-task/plan.md using the latest requirements; preserve the original scope.` Later, explicitly request `/skill:solar-execute` with the plan path when you want implementation.

## What the runtime adds

- Every assessed answer shows ambiguity and signed change as **advisory model estimates**, plus the option to finish or continue. The score is not a calibrated probability or a completion gate.
- The original user request, research snapshot, original answers, and associated questions survive the host handoffs and session resume. Research remains evidence, not instructions or permission to change the goal. A new contradiction can increase ambiguity.
- Bold questions use four rotating round colors; score details are muted. A round without another useful question enters `awaiting_choice` instead of triggering report repair.
- Malformed evidence and other invalid tool reports receive bounded automatic correction. `/solar-interview retry` reuses a saved answer; do not answer an old question again just because formatting failed.
- `/solar-interview continue` requests an optional next question using saved answers. `/solar-interview resume` is a non-generative alias for reopening the interview state, while `/solar-interview review` rerates the existing evidence without creating another answer.
- `/solar-interview finish` ends at any score without another interview assessment, including while an assessment or review is pending. It cancels the pending request, preserves the latest saved answers, marks an older assessment stale when necessary, and starts planning with unresolved and deferred items intact. Planning makes its own model requests. `/solar-interview confirm` is a compatibility alias, not a required second step.
- A clear direct reply can finish the interview. Exact examples include `That's enough`, `I have provided sufficient details. Move on to planning.`, and `충분합니다`. These record the user's choice; they do not prove the intention is sufficiently defined. Hypothetical or quoted mentions of stopping do not finish it.
- Real HTTP 429 responses from direct Upstage Solar Pro4 requests receive delayed retries. There is **no local token, context-size, RPM, or TPM quota**, and no silent reasoning downgrade. Provider limits still apply.
- `/solar-interview status` and `/solar-rate` show status without inference. Finishing does not expand authority: automatic execution is limited to the reversible local work already requested by the user.

## What is not included

No separate controller package, new dependency, background goal engine, multi-agent consensus, provider/account fallback, web-search subscription, or API credentials. The runtime performs only the validated host handoffs; research, planning, and execution remain single-model, prompt-guided skills. Research uses supplied sources, local files, and tools already available in your pi installation. Missing search access must be disclosed.

A separate local prototype evaluated background goal continuation using `@piex-dev/goal`. It is **not bundled or activated here** and is distinct from the host handoffs; neither are downloaded upstream archives, private session logs, or experimental outputs. No release claims benchmark superiority or proven long-running autonomy.

Extensions run with pi's permissions; these instructions are not an operating-system sandbox. Inspect code before installation and use a disposable workspace for untrusted tasks.

## References and licenses

The pre-build review covered **pi-code-planner, pi-autoresearch, @piex-dev/goal, and pi-interview**. The intention-clarification design also draws on **Ouroboros and GJC**, with **oh-my-codex** as orchestration background. The actual host dependencies are **pi-coding-agent, pi-tui, and TypeBox**, supplied by pi.

See [References and the license audit](docs/REFERENCES.md) for every assessed project, versions/source links, what informed this work, and the distinction between inspiration, prototype reuse, and shipped dependencies.

Original package code and documentation: **[MIT](LICENSE)**. Upstream copyrights and licenses remain theirs; [third-party notices](THIRD_PARTY_NOTICES.md) preserve the relevant texts. OMX and pi-interview declare MIT in metadata but lacked a canonical root license file at the audited snapshots; no source from either is bundled. Model/API access is not granted by this license.

## Development and evidence

```powershell
npm test
npm run test:pi
```

The unit tests need only Node. For v0.2.0, 65 unit/package tests and the full isolated real-pi smoke passed, including same-process helper migration/reload and the complete four-stage handoff; targeted `node --check` checks also passed. The smoke uses an isolated temporary profile and local fake API, not your credentials or a live model API. See [validation and known gaps](docs/VALIDATION.md). [Changelog](CHANGELOG.md).
