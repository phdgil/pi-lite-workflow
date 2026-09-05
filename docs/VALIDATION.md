# Validation and known gaps

Release candidate: 0.1.0. Tested on Windows with installed pi 0.85.0 and Node 22.19+ compatibility requirements. These tests are not independent model-quality benchmarks.

Release checks on 2026-09-05: **58 unit/package tests passed** and the isolated real-pi install/review/user-finish smoke test passed. Publication uses an exact-file allowlist: 19 intended runtime/documentation/skill files and no bundled dependencies. Git source archives additionally include the tests and repository metadata files.

## Reproduce without a model key

From a clone or extracted GitHub source archive:

```powershell
npm test
npm run test:pi
```

No project dependency installation is required. The unit suite uses Node built-ins. `test:pi` locates the npm-installed pi CLI; alternatively set `PI_CLI_PATH` to its `dist/bundle/cli.js`. It creates an isolated temporary home, pi profile, workspace, and loopback fake API; it does not read your model/auth configuration. It installs this package into that temporary profile, verifies discovery of all four skills and the extension, and runs scripted structured interview reports.

The smoke test checks actual outgoing `reasoning_effort: max`, saved answers, informational score changes, a valid omitted question at 25% with open issues, explicit review on the same saved answer, retained assessment history, and ANSI-free model reports. It interrupts a review, restarts pi, and verifies that a clear enough-details reply finishes without inference while marking the old assessment stale. It also verifies closure survives restart, `confirm` aliases `finish`, and a user can finish/cancel a request before its first assessment without losing the saved answer. No cutoff gates these transitions. Model calls go only to the local fixture. Successful temporary runs are removed after path checks; failure artifacts remain local for debugging.

To test a published package rather than the local folder:

```powershell
$env:PI_PACKAGE_SOURCE = 'git:github.com/phdgil/pi-solar-lite@v0.1.0'
npm run test:pi
Remove-Item Env:PI_PACKAGE_SOURCE
```

This downloads the public package through pi's normal Git install path; model traffic still uses only the local fake API.

## Evidence and boundaries

- The deterministic runtime regressions cover ambiguity arithmetic without blocker floors, score increases, deferred-choice evidence validation, same-answer review, optional questions, clear versus quoted/hypothetical finish requests, user closure at any score, misleading final-question prefixes, and unchanged 429 retry requests.
- Display checks cover round colors, English/Korean labels, plain model-facing reports, and hiding obsolete questions during processing. An earlier local check exercised 320 real pi Text/Theme renders at narrow/wide widths in dark/light themes; it is not a screenshot inspection of every terminal theme.
- Earlier private developer integration tests exercised missing reports, bounded automatic repairs, actual error flags, reload/restart, and delayed 429 recovery. Those historical tests included the now-removed cutoff and are not the release's completion-policy test. Their private configuration and transcripts are not distributed; the public smoke runner is self-contained.
- Earlier bounded real-Upstage trials verified `solar-pro4` requests with `reasoning_effort: max`. The release tests do not call Upstage or establish semantic quality on the user's current interview.
- User testing exposed a false 25% plateau and endless detail questioning. The final policy removes both the score cutoff and blocker floor: ambiguity informs the user, who alone chooses whether to finish or continue. A missing question is valid, open issues remain in the handoff, and stopping does not pretend every issue was resolved. Legacy floored scores are labeled historical and cannot prevent closure. Scripted tests prove these mechanics, not that Solar will always classify meaning correctly or ask useful questions.
- Research/planning/execution are prompt-guided, manually invoked workflows, not a host-enforced end-to-end controller. No long-horizon superiority, independent-agent consensus, or guaranteed completion is claimed.
- No formatter or standalone TypeScript checker is configured; loading and running the TypeScript extension through the real pi CLI complements the Node checks. Windows is tested; other pi versions/models/OSes need their own validation.

Report reproducible issues with package/pi versions and redacted evidence. Do not publish keys, private user answers, research inputs, or full session exports by default.
