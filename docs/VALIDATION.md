# Validation and known gaps

`v0.3.0` renames the public package, skills, command, and visible tools while intentionally retaining internal `solar-*` saved-state IDs for existing-session compatibility. **69 unit/package tests passed**: the prior 65 plus two parser cases, one alignment/conflict case, and one legacy-closure case. The full isolated real-pi smoke then passed with both the Upstage Solar Pro4/Max fixture and the generic `mock-medium` fixture described below. The historical v0.1.0 and v0.2.0 evidence remains release-specific; these tests are not independent model-quality benchmarks.

Published `v0.1.0` checks on 2026-09-05: **58 unit/package tests passed** and its isolated real-pi install/review/user-finish smoke passed. Publication used an exact-file allowlist and no bundled dependencies. Git source archives additionally include tests and repository metadata files.

For **v0.2.0**, **65 unit/package tests passed** and the full isolated real-pi smoke passed without live API use. Coverage included same-process `.mjs` -> `.ts` migration, `.ts` -> updated `.ts` reload, process restarts, the complete four-stage handoff, original-request/research preservation, no second confirmation, and host-enforced `--research-only`/`--plan-only` blocking even when a synthetic model attempted a ready tool. Empirical jiti behavior confirmed that the `.ts` helper path avoided the observed native-ESM cache mismatch. `node --check` also passed for `runtime/extension.ts`, `runtime/workflow.ts`, and `runtime/interview.ts`. These numbers describe v0.2.0 only and must not be reused as v0.3.0 results.

## Reproduce without a model key

From a clone or extracted GitHub source archive:

```powershell
npm test
npm run test:pi
$env:PI_SMOKE_GENERIC = '1'
npm run test:pi
Remove-Item Env:PI_SMOKE_GENERIC
```

No project dependency installation is required. The unit suite uses Node built-ins. `test:pi` locates the npm-installed pi CLI; alternatively set `PI_CLI_PATH` to its `dist/bundle/cli.js`. It creates an isolated temporary home, pi profile, workspace, and loopback fake API. The default smoke uses the Upstage Solar Pro4 fixture with Max represented on the outgoing wire request; `PI_SMOKE_GENERIC=1` selects the generic `mock-medium` fixture with reasoning disabled. Neither mode reads the user's model/auth configuration or calls a live model API.

The v0.3.0 smoke proved discovery of `lite-research`, `lite-interview`, `lite-plan`, and `lite-execute`; `/lite-interview` as the primary command; legacy skill aliases; `/solar-interview confirm`; and stage-specific visibility of `lite_research_ready`, `lite_interview_round`, and `lite_plan_ready`. It covered reload, restart, both canonical and legacy manual planning-only paths, the complete four-stage handoff, original-intention/research preservation, advisory user-directed finish, no second confirmation, and `--research-only`/`--plan-only` boundaries.

Unit tests cover one to five bounded steps expressed as numbered lists, bold `Step N` blocks, `Step N` headings, or task-checkbox steps while ignoring examples in fenced code blocks. The real-pi smoke includes a positive bold `Step 1` plan and verifies the required plan path, concise alignment statement, and conflicts list. A reported conflict blocks automatic execution; an empty list permits the already-authorized aligned local handoff. Passing these checks proves deterministic parser/report behavior, not independent semantic alignment.

The smoke passed both a generic fake-provider fixture using a mocked medium model with reasoning disabled and the Upstage Solar Pro4 fixture carrying Max on the wire. The transport contract uses pi's generic context hook to preserve the original request and research on model calls without rewriting arbitrary provider wire payloads. Solar-specific `tool_choice` behavior and HTTP 429 retry handling remain isolated.

This mocked transport evidence does **not** test live model intelligence, prove semantic workflow quality, or establish Gemini, Anthropic, or universal provider compatibility. Solar Pro4 Max remains the only live-tested model combination.

The regression fixture accepted the user's actual five-step read-only plan without modifying it, but no real user text was copied into the tests. Synthetic fixtures exercise the same parser and handoff behavior without distributing private task content.

To validate the published v0.3.0 Git source with the isolated fake API after release:

```powershell
$env:PI_PACKAGE_SOURCE = 'git:github.com/phdgil/pi-lite-workflow@v0.3.0'
npm run test:pi
$env:PI_SMOKE_GENERIC = '1'
npm run test:pi
Remove-Item Env:PI_SMOKE_GENERIC
Remove-Item Env:PI_PACKAGE_SOURCE
```

Historical v0.1.0 and v0.2.0 validation should use the runner from the corresponding unchanged tag. A semantic mismatch with the v0.3.0 runner is not evidence of a historical regression.

The v0.2.0 smoke checked outgoing `reasoning_effort: max`, saved answers, informational score changes, optional omitted questions with open issues, same-answer review, retained assessment history, and ANSI-free model reports. It verified validated research-to-interview, distinct original-request/research context, untrusted source labels, direct user finish without reassessment or reconfirmation, structurally ready plan handoff, and boundary cases that did not advance. Calls went only to a loopback fixture. This remains historical evidence, not a v0.3.0 result or a live-model benchmark.

## Evidence and boundaries

- Each workflow stage exposes only the tools it needs. Handoffs remain bound to the original canonical workspace; a settled old execution must not impose its contract on an unrelated question.
- Deterministic regression coverage should include ambiguity arithmetic, score increases, deferred-choice evidence validation, same-answer review, optional questions, clear versus quoted/hypothetical finish requests, user closure at any score, artifact validation, original-request/research persistence, flag boundaries, and unchanged provider-specific retry requests.
- Display checks cover formatting and state transitions, not semantic interview quality or every terminal/theme combination. An earlier local check exercised 320 real pi Text/Theme renders at narrow/wide widths in dark/light themes; it was not a screenshot inspection of every terminal theme.
- Earlier private developer integration tests exercised missing reports, bounded automatic repairs, actual error flags, reload/restart, and delayed 429 recovery. Those historical tests included the now-removed cutoff and are not the current completion-policy test. Their private configuration and transcripts are not distributed.
- Earlier bounded real-Upstage trials verified `solar-pro4` requests with `reasoning_effort: max`. The release suite uses a local fixture and does not establish quality for another model, provider, account, task, or current user interview.
- User testing exposed a false score plateau and endless detail questioning. The current policy makes ambiguity advisory: the user chooses whether to finish, missing questions can be valid, and unresolved/deferred items survive the handoff. Tests can prove these mechanics, not that a model will always understand intent or ask useful questions.
- Research, planning, and execution remain single-model, prompt-guided skills. The host enforces ready-file structure, plan review-report shape, nonempty conflict blocking, and explicit flag boundaries. The model supplies the alignment statement and conflict classification; an empty list is self-review, not independent semantic proof. Common restrictive phrases are recognized, but general natural-language restrictions and semantic judgments remain model-level boundaries.
- Provider independence means the workflow does not require or enforce Upstage configuration. The generic context hook preserves workflow context without rewriting arbitrary provider payloads, but mocked transport behavior does not guarantee support from every provider/model, live intelligence quality, Gemini/Anthropic compatibility, fallback routing, or normalized provider payloads. `tool_choice` handling and HTTP 429 retries remain optional Upstage Solar Pro4-specific features.
- No formatter or standalone TypeScript checker is configured. Use targeted syntax checks, unit tests, and the real-pi isolated smoke as complementary evidence. Windows/pi 0.85.0 and Solar Pro4 Max are the live-tested environment; other operating systems, pi versions, models, and providers need their own validation.
- These instructions do not create an OS sandbox, independent-agent consensus, a separate controller, or guaranteed completion. Do not claim long-horizon superiority from scripted tests.

Report reproducible issues with package/pi versions and redacted evidence. Do not publish keys, private user answers, research inputs, or full session exports by default.
