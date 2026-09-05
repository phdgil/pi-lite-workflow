# pi-solar-lite

**Research the context. Sharpen the intention. Plan executable steps. Verify the result.**

Four lightweight skills and an interview/runtime extension for [pi](https://github.com/earendil-works/pi), developed while testing **Upstage Solar Pro4 Max**. The goal is not merely to keep a model running: it is to turn a vague request into a documented intention, a workable plan, and evidence that the work meets the user's chosen outcome.

**v0.1.0 is experimental.** Tested with pi 0.85.0 on Windows. Other models and operating systems are not yet validated. This is an independent community package, not an official Upstage, pi, GJC, or OMX release.

## Why this exists

A useful interview should uncover what the user means, not ask a context-free checklist of implementation questions. Research first helps distinguish facts the agent can find from priorities only the user can decide. The interview then explores assumptions, ambiguous words, tradeoffs, and observable success until the user chooses to finish. Planning turns that user-ended interview, including any unresolved issues and deferred choices, into small, checkable steps; execution checks the result instead of treating a confident answer as completion.

The model-facing instructions stay small. The host handles interview state, score arithmetic, recovery, and display. This reduces workflow bookkeeping, but does **not** guarantee better reasoning or eliminate repeated questions.

## Install into pi

Requires Node.js **22.19+**, Git on PATH, pi, and your own authorized model access. No Codex account, GJC installation, or other community controller is required.

If pi is not installed, the tested version is:

```powershell
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.0
```

Install this release from PowerShell or your terminal:

```powershell
pi install git:github.com/phdgil/pi-solar-lite@v0.1.0
pi
```

This installs **both** the four skills and the runtime extension. Copying only `SKILL.md` is not sufficient. After installation or an update, restart pi; use `/resume` to reopen an existing conversation.

Inside pi, authenticate with `/login`, choose `upstage/solar-pro4` with `/model`, and select `max` with `/thinking`. Ctrl+S in each picker saves the startup default, so normal launches need only `pi`. If Solar or Max is missing, follow the [installation and credential-free model setup guide](docs/INSTALL.md), rather than pasting credentials into this repository.

## The sequence

**Research → interview → plan → execute** is a manual, same-conversation workflow in this release. Stages do not automatically launch each other.

| Stage | Command inside pi | Purpose and handoff |
| --- | --- | --- |
| 1. Research | `/skill:solar-research` | Collect available context and evidence; save `research.md`. Avoid asking the user facts the agent can establish. |
| 2. Interview | `/skill:solar-interview` | Sharpen intent, assumptions, scope, and success through one question per turn. Save answers and assessments in the pi session. |
| 3. Plan | `/skill:solar-plan` | Use the finished interview and research, including unresolved and deferred items, to produce executable steps, checks, design review, and risk review in `plan.md`. |
| 4. Execute | `/skill:solar-execute` | Carry out an explicitly authorized local scope, verify each step, and record results/blockers in `progress.md`. |

Example: use the same task folder and pi conversation throughout.

```text
/skill:solar-research Use solar-work/study-helper. Investigate the supplied course materials and existing tools. Save useful facts, sources, and unknowns; do not implement.
/skill:solar-interview Use solar-work/study-helper/research.md. I want a tool that helps students choose an analysis method. Help clarify what this should achieve.
```

After each round, the score is informational and you can either finish or continue. You may also finish while an assessment or review is pending, even if the display still lists unresolved issues:

```text
/solar-interview finish
/skill:solar-plan Use solar-work/study-helper, its research.md, and the finished interview in this conversation. Carry unresolved and deferred items into executable steps and acceptance checks. Do not implement.
```

Review the plan, then authorize its local scope:

```text
/skill:solar-execute I approve the local implementation described in solar-work/study-helper/plan.md. Implement and verify it; preserve unrelated files.
```

The planner's design/architect and critic passes are **one model's sequential self-review**, not independent-agent consensus. See the [workflow and handoff guide](docs/WORKFLOW.md) for roles, saved artifacts, completion conditions, and limitations.

## What the runtime adds

- Every assessed answer shows ambiguity and signed change as **advisory model estimates**, plus the option to finish or continue. The score is not a calibrated probability or a completion gate.
- Original answers and their associated questions survive session resume. A new contradiction can increase ambiguity.
- Bold questions use four rotating round colors; score details are muted. A round without another useful question enters `awaiting_choice` instead of triggering report repair.
- Malformed evidence and other invalid tool reports receive bounded automatic correction. `/solar-interview retry` reuses a saved answer; do not answer an old question again just because formatting failed.
- `/solar-interview continue` requests an optional next question using saved answers. `/solar-interview resume` is a non-generative alias for reopening the interview state, while `/solar-interview review` rerates the existing evidence without creating another answer.
- `/solar-interview finish` ends at any score without inference, including while an assessment or review is pending. It cancels the pending request, preserves the latest saved answers, marks an older assessment stale when necessary, and carries unresolved and deferred items forward without claiming they were resolved. `/solar-interview confirm` is the same finish operation.
- A clear direct reply can finish the interview. Exact examples include `That's enough`, `I have provided sufficient details. Move on to planning.`, and `충분합니다`. These record the user's choice; they do not prove the intention is sufficiently defined. Hypothetical or quoted mentions of stopping do not finish it.
- Real HTTP 429 responses from direct Upstage Solar Pro4 requests receive delayed retries. There is **no local token, context-size, RPM, or TPM quota**, and no silent reasoning downgrade. Provider limits still apply.
- `/solar-interview status` and `/solar-rate` show status without inference. Finishing the interview does not authorize implementation.

## What is not included

No automatic four-stage controller, background goal engine, multi-agent consensus, provider/account fallback, web-search subscription, or API credentials. Research uses supplied sources, local files, and tools already available in your pi installation. Missing search access must be disclosed.

A separate local prototype evaluated automatic continuation using `@piex-dev/goal`. It is **not bundled or activated here**; neither are downloaded upstream archives, private session logs, or experimental outputs. This release does not claim benchmark superiority or proven long-running autonomy.

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

The unit tests need only Node. The pi smoke test needs the installed tested pi version and uses an isolated temporary profile plus a local fake API, not your credentials. See [validation and known gaps](docs/VALIDATION.md). [Changelog](CHANGELOG.md).
