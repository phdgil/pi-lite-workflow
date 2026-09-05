# Validation and known gaps

Releases `v0.1.0` and `v0.2.0` have different workflow semantics. Both target Windows with installed pi 0.85.0 and Node 22.19+ compatibility requirements. These tests are not independent model-quality benchmarks.

Published `v0.1.0` release checks on 2026-09-05: **58 unit/package tests passed** and its isolated real-pi install/review/user-finish smoke test passed. Publication used an exact-file allowlist and no bundled dependencies. Git source archives additionally include tests and repository metadata files.

For **v0.2.0**, **65 unit/package tests passed** and the full isolated real-pi smoke passed without live API use. Coverage includes same-process `.mjs` -> `.ts` migration, `.ts` -> updated `.ts` reload, process restarts, the complete four-stage handoff, original-request/research preservation, no second confirmation, and host-enforced `--research-only`/`--plan-only` blocking even when a synthetic model attempts a ready tool. Empirical jiti behavior confirms the `.ts` helper path avoids the observed native-ESM cache mismatch. `node --check` also passes for `runtime/extension.ts`, `runtime/workflow.ts`, and `runtime/interview.ts`.

## Reproduce without a model key

From a clone or extracted GitHub source archive:

```powershell
npm test
npm run test:pi
```

No project dependency installation is required. The unit suite uses Node built-ins. `test:pi` locates the npm-installed pi CLI; alternatively set `PI_CLI_PATH` to its `dist/bundle/cli.js`. It creates an isolated temporary home, pi profile, workspace, and loopback fake API; it does not read your model/auth configuration. It installs this package into that temporary profile, verifies discovery of all four skills and the extension, and runs scripted structured interview reports.

The current smoke test checks actual outgoing `reasoning_effort: max`, saved answers, informational score changes, a valid omitted question with open issues, explicit review on the same saved answer, retained assessment history, and ANSI-free model reports. It verifies that validated research starts interviewing, the original request and research remain distinct persistent context, source snapshots are labeled untrusted data, a clear finish reply starts planning without another interview assessment or reconfirmation, a structurally ready reviewed plan starts authorized local execution, and stop/boundary cases do not advance. No ambiguity cutoff gates user finish. Model calls go only to the local fixture. Successful temporary runs are removed after path checks; failure artifacts remain local for debugging.

To validate installation from GitHub with the same local fake API:

```powershell
$env:PI_PACKAGE_SOURCE = 'git:github.com/phdgil/pi-solar-lite@v0.2.0'
npm run test:pi
Remove-Item Env:PI_PACKAGE_SOURCE
```

The current runner expects v0.2.0 handoffs. Historical v0.1.0 validation used the runner from that release; do not interpret the expected semantic mismatch with this runner as a v0.1.0 regression.

## Evidence and boundaries

- Active interview requests expose only `read` and `solar_interview_round`, including after reload and review. Other stages expose only their matching handoff tool. Handoffs are bound to the original canonical workspace; stopped or settled execution no longer imposes an old workflow contract on an unrelated question. Execution `idle` means the turn settled, not that its output was independently verified.

- The deterministic runtime regressions cover ambiguity arithmetic without blocker floors, score increases, deferred-choice evidence validation, same-answer review, optional questions, clear versus quoted/hypothetical finish requests, user closure at any score, workflow artifact validation, original-request/research persistence, host-enforced flag boundaries, misleading final-question prefixes, and unchanged 429 retry requests.
- Display checks cover round colors, English/Korean labels, plain model-facing reports, and hiding obsolete questions during processing. An earlier local check exercised 320 real pi Text/Theme renders at narrow/wide widths in dark/light themes; it is not a screenshot inspection of every terminal theme.
- Earlier private developer integration tests exercised missing reports, bounded automatic repairs, actual error flags, reload/restart, and delayed 429 recovery. Those historical tests included the now-removed cutoff and are not the release's completion-policy test. Their private configuration and transcripts are not distributed; the public smoke runner is self-contained.
- Earlier bounded real-Upstage trials verified `solar-pro4` requests with `reasoning_effort: max`. The release tests do not call Upstage or establish semantic quality on the user's current interview.
- User testing exposed a false 25% plateau and endless detail questioning. The final policy removes both the score cutoff and blocker floor: ambiguity informs the user, who alone chooses whether to finish or continue. A missing question is valid, open issues remain in the handoff, and stopping does not pretend every issue was resolved. Legacy floored scores are labeled historical and cannot prevent closure. Scripted tests prove these mechanics, not that Solar will always classify meaning correctly or ask useful questions.
- Research, planning, and execution remain single-model, prompt-guided skills. The host enforces ready-file structure and explicit `--research-only`/`--plan-only` tool boundaries. Common restrictive phrases are also recognized, but arbitrary natural-language restrictions and semantic judgments remain model-level. It does not prove semantic quality, provide an OS sandbox, or create a separate controller/dependency. No long-horizon superiority, independent-agent consensus, or guaranteed completion is claimed.
- No formatter or standalone TypeScript checker is configured; `node --check`, same-process reload/migration coverage, and loading/running the TypeScript extension through the real pi CLI complement the Node tests. Windows is tested; other pi versions/models/OSes need their own validation.

Report reproducible issues with package/pi versions and redacted evidence. Do not publish keys, private user answers, research inputs, or full session exports by default.
