# pi-lite-workflow

**Research the context. Sharpen the intention. Plan executable steps. Verify the result.**

Four lightweight skills and an interview/runtime extension for [pi](https://github.com/earendil-works/pi). The workflow is designed for tool-capable models, including smaller and medium models, but model quality and tool support vary; compatibility is not guaranteed for every model or provider.

**v0.3.0 is experimental.** It adopts provider-independent branding and the `lite-*` public names. Solar Pro4 Max is the only model combination live-tested so far. This is an independent community package, not an official pi, Upstage, GJC, or OMX release.

## Why this exists

A useful interview should uncover what the user means, not ask a context-free checklist of implementation questions. Research first separates facts the agent can find from priorities only the user can decide. The interview then explores assumptions, ambiguous words, tradeoffs, and observable success until the user chooses to finish. Planning turns that user-ended interview, including unresolved issues and deferred choices, into small, checkable steps. Execution verifies the result instead of treating a confident answer as completion.

The model-facing instructions stay small. The host handles interview state, score arithmetic, recovery, display, and validated stage handoffs. This reduces workflow bookkeeping, but does **not** guarantee better reasoning, useful questions, or successful completion.

## Install into pi

Requires Node.js **22.19+**, Git on PATH for Git installation, pi, and authorized access to a tool-capable model. No Codex account, GJC installation, Upstage account, or other community controller is required.

If pi is not installed, the live-tested version is:

```powershell
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.0
```

For a fresh installation of v0.3.0:

```powershell
pi install git:github.com/phdgil/pi-lite-workflow@v0.3.0
pi
```

This installs all four skills and the runtime extension. Copying only a `SKILL.md` is not sufficient. See the [installation guide](docs/INSTALL.md) for migration from the old repository, local installation, and the optional Upstage example. After installation or an update, restart pi; use `/resume` to reopen an existing conversation.

The package does not select a provider, change your account, or enforce a model/default. Use pi's normal `/login`, `/model`, and `/thinking` controls for the provider and model you are authorized to use. The CLI launch command remains `pi`.

## The sequence

**Research -> interview -> plan -> execute** is a same-conversation workflow with validated host handoffs.

| Stage | Command inside pi | Purpose and handoff |
| --- | --- | --- |
| 1. Research | `/skill:lite-research` | Collect context and save a structurally complete `research.md`; `lite_research_ready` validates it and starts the interview. |
| 2. Interview | launched by the host, `/lite-interview`, or `/skill:lite-interview` | Sharpen the original request using research as evidence, never as a replacement goal. The user may finish at any ambiguity score. |
| 3. Plan | launched by interview finish | Use the original request, research, saved answers, unresolved issues, and deferrals to write and review `plan.md`. |
| 4. Execute | launched after `lite_plan_ready` | Execute only the originally authorized, reversible local scope; verify each step and record results or blockers in `progress.md`. |

Example: use the same task folder and pi conversation throughout.

```text
/skill:lite-research Use work/study-helper. I want a local study guide that helps students choose an analysis method. Research the supplied course materials and existing tools, clarify my intention, then plan, create, and verify the guide. Preserve source materials and unrelated files.
```

When `research.md` has `Status: complete` and nonempty `Original intention`, `Evidence`, `Caveats and unknowns`, and `Useful interview questions` sections, the host starts the interview. The original request and research snapshot remain distinct and available on every interview request. Research can prevent repeated factual questions without silently becoming a new goal or new authorization.

After each round, the displayed ambiguity score and change are advisory model estimates. The user decides whether to continue or finish:

```text
/lite-interview finish
```

`finish`, or a clear direct natural-language equivalent, starts planning immediately with no second confirmation. Before handoff, the planner supplies `lite_plan_ready` with the plan path, a concise alignment statement, and a conflicts list. The host verifies both the file's required sections and one to five bounded steps plus that review report. An empty conflicts list permits automatic execution when the interview and plan align and the original request already authorizes that reversible local work; no additional approval is required. Nonempty conflicts, material blockers, missing permissions, destructive or external work, and research-only or planning-only constraints stop the sequence.

Use `--research-only` on the initial research request to stop after research, or `--plan-only` to disable the plan-to-execute handoff. These explicit flags and the research/plan file validators are host-enforced, including when a model attempts a ready tool anyway. Common restrictive phrases are recognized, but general natural-language scope interpretation remains a model-level boundary. `/lite-interview finish plan-only` starts planning without automatic execution. `/lite-interview stop` saves and cancels without launching another stage.

The planner's design/architect and critic passes are **one model's sequential self-review**, not independent-agent consensus. See the [workflow guide](docs/WORKFLOW.md) for artifacts, completion conditions, and limitations.

### When to call the planner directly

Normally, do not call it again after `/lite-interview finish`: planning has already started. Use `/skill:lite-plan` when requirements are already clear, when deliberately skipping the interview, or when revising an existing plan. Actual manual testing covered both skip/replan use and normal interview finish without a second planner call.

For a planning-only review:

```text
/skill:lite-plan --plan-only Review and revise work/my-task/plan.md using the latest requirements; preserve the original scope.
```

Later, explicitly request `/skill:lite-execute` with the plan path when implementation is authorized.

## Migration aliases

`/lite-interview` is the primary runtime command. `/solar-interview` and `/skill:solar-research`, `/skill:solar-interview`, `/skill:solar-plan`, and `/skill:solar-execute` remain runtime aliases for migration. The package does not ship duplicate old `SKILL.md` files.

Saved internal `solar-*` state identifiers intentionally remain unchanged so existing conversations can resume. They are persistence details, not the public package or skill names.

## What the runtime adds

- Every accepted assessment shows ambiguity and signed change as informational estimates, plus the choice to finish or continue. The score is not a calibrated probability or completion gate.
- The original request, research snapshot, original answers, and associated questions survive host handoffs and session resume. Source snapshots are treated as untrusted evidence, not instructions.
- A generic pi context hook supplies the original request and research snapshot to model calls without rewriting arbitrary provider wire payloads. Solar-specific `tool_choice` handling and HTTP 429 retries remain isolated provider features.
- Bold questions use four rotating round colors, score details are muted, and a round without another useful question enters `awaiting_choice` instead of triggering report repair.
- Malformed evidence and other invalid tool reports receive bounded automatic correction. `/lite-interview retry` reuses the saved answer rather than asking the user to repeat it.
- `/lite-interview continue`, `resume`, and `review` respectively request an optional next question, reopen state without inference, and rerate existing evidence without creating another answer.
- `/lite-interview finish` works at any score, including while assessment or review is pending. It preserves saved answers and carries unresolved and deferred items into planning without another interview assessment or confirmation.
- A clear direct reply can finish the interview. This records the user's choice; it does not prove that the intention is sufficiently defined. Hypothetical or quoted mentions of stopping do not finish it.
- Plan handoff checks the bounded plan structure and requires the model's concise alignment/conflicts self-review. Deferred implementation details are not conflicts merely because they remain for execution; a nonempty conflict list blocks automatic execution. An empty list is not independent proof of semantic alignment.
- Delayed retries for real HTTP 429 responses are an optional, provider-specific feature currently limited to direct Upstage Solar Pro4 requests. They do not impose a local quota, bypass provider limits, or provide provider/account fallback.
- Finishing never expands authority: automatic execution remains limited to reversible local work already requested by the user.

## What is not included

No separate controller package, new dependency, background goal engine, multi-agent consensus, provider/account fallback, web-search subscription, API credentials, or enforced model configuration. Research, planning, and execution remain single-model, prompt-guided skills using sources and tools already available in the pi installation. Missing tool or search access must be disclosed.

A separate local prototype evaluated background goal continuation using `@piex-dev/goal`. It is **not bundled or activated here** and is distinct from the host handoffs. Downloaded upstream archives, private session logs, and experimental outputs are also excluded. No release claim promises benchmark superiority, long-running autonomy, or universal model compatibility.

Extensions run with pi's permissions; these instructions are not an operating-system sandbox. Inspect code before installation and use a disposable workspace for untrusted tasks.

## References and licenses

The pre-build review covered **pi-code-planner, pi-autoresearch, @piex-dev/goal, and pi-interview**. The intention-clarification design also draws on **Ouroboros and GJC**, with **oh-my-codex** as orchestration background. The actual host dependencies are **pi-coding-agent, pi-tui, and TypeBox**, supplied by pi.

See [References and the license audit](docs/REFERENCES.md) for every assessed project, source/version links, credited influences, and the distinction between inspiration, prototype reuse, and shipped dependencies.

Original package code and documentation: **[MIT](LICENSE)**. Upstream copyrights and licenses remain theirs; [third-party notices](THIRD_PARTY_NOTICES.md) preserve the relevant texts. OMX and pi-interview declare MIT in metadata but lacked a canonical root license file at the audited snapshots; no source from either is bundled. Model/API access is not granted by this license.

## Development and evidence

```powershell
npm test
npm run test:pi
$env:PI_SMOKE_GENERIC = '1'
npm run test:pi
Remove-Item Env:PI_SMOKE_GENERIC
```

For v0.3.0, **69 unit/package tests passed**, followed by full isolated real-pi smoke passes for both the Upstage Solar Pro4 fixture with Max on the wire and the generic `mock-medium` fixture with reasoning disabled. Coverage includes reload/restart, legacy aliases, the whole workflow, plan alignment/conflict handling, and marked-step parsing. Both fixtures use only loopback mocks, not user credentials or live model intelligence. See [validation and known gaps](docs/VALIDATION.md) and the [changelog](CHANGELOG.md).
