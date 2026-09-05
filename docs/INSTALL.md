# Install in pi

This guide targets pi 0.85.0 on Windows/PowerShell, the tested environment. The package does not require Codex, GJC, Python, a special launcher, or another autonomous-loop package. Other operating systems are not yet validated.

## 1. Prerequisites

Install Node.js 22.19 or newer and Git. Check `node --version`, `npm --version`, and `git --version` in a new terminal. If you already have pi, check `pi --version`; do not unnecessarily replace a working installation.

The tested installation command follows [pi's official npm instructions](https://github.com/earendil-works/pi/blob/v0.85.0/packages/coding-agent/README.md#quick-start), pinned to the tested version:

```powershell
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.0
```

If PowerShell blocks an npm/pi `.ps1` shim, use the sibling command `npm.cmd` or `pi.cmd` for that invocation. This does not require weakening the machine-wide execution policy or creating a launcher file. Normally, launch the app by typing `pi`.

## 2. Install the whole package

### Release `v0.2.0`

```powershell
pi install git:github.com/phdgil/pi-solar-lite@v0.2.0
pi list
```

Pi registers the package in its user settings and loads the four skills plus `runtime/extension.ts`, including automatic host handoffs. It does not install an additional autonomous controller. Review any package before installing: pi extensions execute with your account's permissions. See the [official package documentation](https://github.com/earendil-works/pi/blob/v0.85.0/packages/coding-agent/docs/packages.md).

Alternative: download the release source ZIP from GitHub, extract it to a permanent folder, inspect it, then run:

```powershell
pi install "C:\path\to\pi-solar-lite-0.2.0"
```

Replace that path with the extracted folder containing `package.json`. Pi references a local package in place; do not move or delete it after installation. No separate build or `npm install` is needed for this package's host-provided dependencies. Git installation requires Git; local-folder installation does not require creating a Git repository.

### Local checkout

To test the current checkout, inspect it and install its repository root as a local package:

```powershell
pi install "C:\path\to\pi-solar-lite"
```

A local installation loads that checkout directly, including future development changes. Do not enable the local checkout and a Git installation together.

Do not install both copies. Previous experimental users must disable the old standalone `solar-runtime.ts` loader and duplicate `solar-*` skill entries before enabling this package, using `pi config` or by moving those old entries outside pi's discovery directories. Do not delete session history. This migration is not needed for a fresh installation.

## 3. Configure Solar without distributing a key

Use your own authorized Upstage API access. Installing these skills does not provide free API usage, change an allowance, or bypass server rate limits.

The credential-free example is [`examples/models.upstage.json`](../examples/models.upstage.json). Its `thinkingLevelMap` explicitly sends `max` when pi selects Max, rather than assuming a UI label proves the wire request.

- If Solar Pro4 and Max already work, retain your configuration.
- If you have no model configuration, save the example content as `~/.pi/agent/models.json` (Windows: `$HOME\.pi\agent\models.json`).
- If that file already exists, back it up and merge only the `providers.upstage` settings you need. **Do not replace other providers, credentials, models, or headers.** Merge the `solar-pro4` model by ID if other Upstage models are present.

The example deliberately omits `apiKey`. Start `pi`, enter `/login`, select Upstage, and enter your API key through pi's credential UI. Pi manages credentials separately; keep its `auth.json` private. If using environment-based authentication instead, add `"apiKey": "$UPSTAGE_API_KEY"` to the Upstage provider and supply that variable securely outside the repository. Never paste a real key into a shared JSON file, prompt, issue, screenshot, or Git commit.

Pi's model behavior and credential resolution are documented in [Custom Models](https://github.com/earendil-works/pi/blob/v0.85.0/packages/coding-agent/docs/models.md). Catalogs and API entitlements can change; the example is a tested compatibility setup, not a promise that every account has the model.

## 4. Choose and save defaults inside pi

1. `/model`: highlight `upstage/solar-pro4`; Ctrl+S saves it as the startup model.
2. `/thinking`: select `max`; Ctrl+S saves the startup thinking level.
3. Verify the footer shows the intended model and Max before a task. Resuming another conversation can restore that conversation's model/level; check them again.

The startup pickers are documented in [pi settings](https://github.com/earendil-works/pi/blob/v0.85.0/packages/coding-agent/docs/settings.md). Ordinary launches then need only:

```powershell
pi
```

For an explicit one-off test, `pi --model upstage/solar-pro4:max` selects the tested combination. The package itself does not change account selection, provider routing, or your startup defaults.

## 5. Check installation, then use the workflow

Restart pi after installation. `/solar-rate` should show `mode: retry-only` without calling an API. `/solar-interview status` should report no current assessment or your resumed assessment. Typing `/skill:solar-` should offer research, interview, plan, and execute. If missing, check `pi list` and `pi config` for disabled or duplicate resources.

Use [research -> interview -> plan -> execute](WORKFLOW.md) in the same conversation and task folder. A complete research report starts interviewing, user-directed interview finish starts planning, and a ready reviewed plan starts authorized reversible local execution. The original request and research snapshot survive each handoff. Before continuing existing work, use `/resume` to select its saved conversation rather than starting a fresh interview.

## Updates, interruptions, and removal

- Version-pinned installations do not automatically move to a newer tag. To upgrade an existing `v0.1.0` Git installation, remove that package registration with `pi remove git:github.com/phdgil/pi-solar-lite@v0.1.0`, then install `git:github.com/phdgil/pi-solar-lite@v0.2.0`. Do not delete authentication, model settings, or sessions. Restart pi and use `/resume`.
- Runtime helpers use `.ts` imports to avoid the native-ESM `.mjs` cache mismatch observed with pi 0.85.0 and jiti. Isolated real-pi validation covers same-process `.mjs` -> `.ts` migration and `.ts` -> updated `.ts` reload, plus process restart. Restart pi and `/resume` remains the simplest recovery path after interruption.
- While a question is being assessed, wait. Bounded automatic repair applies to malformed evidence and other invalid tool reports. If that correction stops, `/solar-interview retry` uses the already-saved answer and makes a model request; `status` is read-only and free of inference.
- `/solar-interview finish` ends at any score and starts planning without a second confirmation. It also works while an assessment or review is pending: it cancels the pending request, preserves saved answers, and labels an older assessment stale rather than treating it as current. `confirm` is a compatibility alias only. `/solar-interview finish plan-only` starts planning without auto-execution; `/solar-interview stop` saves and cancels without launching another stage. `/solar-interview continue` requests an optional next question from saved answers; `/solar-interview resume` only reopens saved state without inference or a model request.
- `/solar-interview review` rerates the existing saved evidence without creating a duplicate answer. It preserves the previous assessment and round number and does not automatically clear unresolved items. Restart and `/resume` first when loading this runtime update.
- Real 429 responses may cause visible waits. The wrapper honors usable retry headers; otherwise waits start at 60 seconds, then 120/240/300/300. It allows up to five retries and 20 minutes of cumulative retry waiting per request. Esc or a caller timeout can stop sooner. It does not retry non-429 network errors, and it cannot eliminate provider-side limits.
- Remove a Git installation with `pi remove git:github.com/phdgil/pi-solar-lite@v0.2.0`, then restart pi. For a local installation, pass its installed path to `pi remove`. Your saved conversation and project outputs are not removed by this package.

This release is experimental; report failures with pi/package versions and redacted diagnostics, not keys or private transcripts.
