# Install pi-lite-workflow in pi

This guide targets pi 0.85.0 on Windows/PowerShell, the environment tested so far. The package is intended for tool-capable models, including smaller and medium models, but not every model/provider combination is guaranteed to support the workflow correctly. It does not require Codex, GJC, Python, Upstage, a special launcher, or another autonomous-loop package.

## 1. Prerequisites

Install Node.js 22.19 or newer and Git. Check `node --version`, `npm --version`, and `git --version` in a new terminal. If pi already works, check `pi --version` and do not unnecessarily replace it.

The live-tested pi installation command follows [pi's official npm instructions](https://github.com/earendil-works/pi/blob/v0.85.0/packages/coding-agent/README.md#quick-start):

```powershell
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.0
```

If PowerShell blocks an npm/pi `.ps1` shim, use the sibling `npm.cmd` or `pi.cmd` for that invocation. This does not require weakening the machine-wide execution policy or creating a launcher. The CLI launch command remains `pi`.

## 2. Fresh Git installation

Install release `v0.3.0` from the renamed repository:

```powershell
pi install git:github.com/phdgil/pi-lite-workflow@v0.3.0
pi list
pi
```

Pi registers the package in user settings and loads the four `lite-*` skills plus `runtime/extension.ts`. It does not install an autonomous controller or change the selected account, provider, model, or thinking default. Review any package before installation: pi extensions execute with the user's permissions. See the [official package documentation](https://github.com/earendil-works/pi/blob/v0.85.0/packages/coding-agent/docs/packages.md).

Alternative: download the v0.3.0 source ZIP from `phdgil/pi-lite-workflow`, extract it to a permanent folder, inspect it, then run:

```powershell
pi install "C:\path\to\pi-lite-workflow-0.3.0"
```

Pi references a local package in place; do not move or delete it after installation. No separate build or `npm install` is needed for host-provided dependencies. Git installation requires Git; local-folder installation does not require a Git repository.

## 3. Migrate an existing Git installation

Avoid registering the old and renamed Git sources together. First list installed packages:

```powershell
pi list
```

Find the exact registered source for `phdgil/pi-solar-lite`, then pass that exact value to `pi remove`. For example, if `pi list` shows the v0.2.0 source:

```powershell
pi remove git:github.com/phdgil/pi-solar-lite@v0.2.0
pi install git:github.com/phdgil/pi-lite-workflow@v0.3.0
pi list
```

Do not guess the old tag or remove a different registration. Removing the old package registration does **not** require deleting authentication keys, model settings, project files, or saved sessions. Restart pi and use `/resume` to reopen an existing conversation.

If an older experimental setup manually copied or separately registered resources, migrate those skill files to the four `lite-*` names and the standalone loader to `lite-runtime.ts`. Disable or move the old registered `solar-*` resources outside pi's discovery directories so they do not load as duplicates. The legacy command and skill aliases come from the new runtime; duplicate old skill files are not needed. Do not delete session history.

## 4. Local checkout

For the current development checkout, keep its existing legacy folder name so the installed local source path remains stable:

```powershell
pi install "C:\path\to\pi-solar-lite"
```

Do not rename that local folder merely for branding. A local installation loads the checkout directly, including future changes. Do not enable the local checkout and a Git installation together.

## 5. Choose a provider and model

Use pi's normal `/login`, `/model`, and `/thinking` controls for any authorized tool-capable model. The package does not enforce a provider, install credentials, change an account, or save startup defaults. Verify the selected model and thinking level before important work, especially after `/resume` restores a conversation-specific selection.

Solar Pro4 Max is the only model combination live-tested so far. Upstage users may optionally use the credential-free [`examples/models.upstage.json`](../examples/models.upstage.json) compatibility example. It is **not** part of the general installation requirement.

If using the optional Upstage example:

- Preserve any working configuration. If `~/.pi/agent/models.json` already exists, back it up and merge only the required `providers.upstage` settings; do not replace other providers, credentials, models, or headers.
- The example omits `apiKey`. Enter the key through pi's `/login` credential UI, or reference a securely supplied environment variable. Keep `auth.json` private and never commit or paste a real key into shared files, prompts, issues, screenshots, or logs.
- Its `thinkingLevelMap` explicitly maps pi's Max selection to the request payload. This is an Upstage-specific compatibility example, not a required default or a general provider contract.

Pi's model and credential behavior is documented in [Custom Models](https://github.com/earendil-works/pi/blob/v0.85.0/packages/coding-agent/docs/models.md) and [settings](https://github.com/earendil-works/pi/blob/v0.85.0/packages/coding-agent/docs/settings.md). Catalogs, payloads, and entitlements can change.

## 6. Check installation

Restart pi, then confirm:

- Typing `/skill:lite-` offers `lite-research`, `lite-interview`, `lite-plan`, and `lite-execute`.
- `/lite-interview status` reports no active assessment or the resumed assessment without starting inference.
- The model has the stage-appropriate visible tool: `lite_research_ready`, `lite_interview_round`, or `lite_plan_ready`.

`/solar-interview` and `/skill:solar-*` remain runtime aliases for migration, but no duplicate old skill files are installed. Internal saved `solar-*` state IDs remain unchanged so old sessions can resume.

Use [research -> interview -> plan -> execute](WORKFLOW.md) in the same conversation and task folder. Before continuing existing work, use `/resume` rather than starting a fresh interview.

## Updates, interruptions, and removal

- Version-pinned Git installations do not automatically move to a newer tag. Use `pi list`, remove the exact registered source, install the desired exact source, restart pi, and resume the conversation.
- Runtime helpers use `.ts` imports to avoid the native-ESM `.mjs` cache mismatch observed with pi 0.85.0 and jiti. Restarting pi and using `/resume` remains the simplest recovery path after an interrupted update.
- While a question is being assessed, wait. Bounded repair handles malformed reports. `/lite-interview retry` reassesses the saved answer; `status` is read-only.
- `/lite-interview finish` ends at any advisory score and starts planning without a second confirmation. `finish plan-only` plans without auto-execution; `stop` saves and cancels; `continue` requests an optional next question; `resume` reopens state without inference; `review` rerates saved evidence.
- Direct Upstage Solar Pro4 HTTP 429 responses may receive delayed retries. The wrapper honors usable retry headers; otherwise waits begin at 60 seconds and increase within the documented retry budget. Esc or a caller timeout can stop sooner. This optional provider-specific behavior does not retry every network error, remove provider limits, or apply a local token/RPM/TPM quota.
- Remove a Git installation by passing its exact `pi list` source to `pi remove`, then restart pi. For a local installation, pass its installed path. Package removal does not delete saved conversations or project outputs.
