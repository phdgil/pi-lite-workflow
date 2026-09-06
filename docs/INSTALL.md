# Install pi-solar-workflow in pi

This guide is **Windows/PowerShell only** and targets pi 0.85.1 with **Upstage Solar Pro4 Max**. Every workflow role—the main stage role plus Planner, Approach Reviewer, and Critic—must resolve to the configured Upstage `solar-pro4` model with Max thinking or stop visibly. There is no generic-model compatibility promise or fallback. The package verifies this requirement but does not install credentials, change an account, or rewrite provider/model settings.

The controller uses pi 0.85.1's exported `createAgentSession`, `DefaultResourceLoader`, `SessionManager.inMemory`, `SettingsManager.inMemory`, and `AgentSession` state/prompt/abort/dispose surfaces. Source and type inspection establishes the supported API contract, not a completed runtime or live-model test. The evidence-gated controller is included in the runtime extension; no separate controller, Codex account, GJC installation, or Python environment is required. Authorized Upstage access is required to run the workflow.

## 1. Prerequisites

Install Node.js 22.19 or newer and Git. Check `node --version`, `npm --version`, and `git --version` in a new PowerShell window. If pi already works, check `pi --version` and do not unnecessarily replace it.

The required host version follows [pi 0.85.1's official npm instructions](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/README.md#quick-start):

```powershell
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.1
```

This is a deployment command: run it only under separate explicit installation approval. It is shown here as guidance and is not evidence that installation occurred. If PowerShell blocks an npm/pi `.ps1` shim, use the sibling `npm.cmd` or `pi.cmd` for that invocation. This does not require weakening the machine-wide execution policy or creating a launcher. The CLI launch command remains `pi`.

## 2. Published baseline installation

Release `v0.3.0` is the published baseline. It predates the Unreleased iterative controller contract documented in this checkout:

```powershell
pi install git:github.com/phdgil/pi-solar-workflow@v0.3.0
pi list
pi
```

The unchanged `v0.3.0` tag is a historical baseline: although it is reachable from the renamed repository, that tag still contains the former `pi-lite-workflow` package and Lite-branded skills and commands. It does not provide the current Solar-branded discovery/UI, exact-revision approval, bounded detours, or execution gates. Review any package before installation: pi extensions execute with the user's permissions. See the [official pi 0.85.1 package documentation](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/packages.md).

Alternative: download the v0.3.0 source ZIP from `phdgil/pi-solar-workflow`, extract it to a permanent folder, inspect it, then run:

```powershell
pi install "C:\path\to\pi-solar-workflow-0.3.0"
```

Pi references a local package in place; do not move or delete it after installation. No separate build or `npm install` is needed for host-provided dependencies. Git installation requires Git; local-folder installation does not require a Git repository.

## 3. Migrate an existing Git installation

Avoid registering the old and renamed Git sources together. First list installed packages:

```powershell
pi list
```

Find the exact registered source for the previous repository, then pass that exact value to `pi remove`. For example, if `pi list` shows the published v0.3.0 source:

```powershell
pi remove git:github.com/phdgil/pi-lite-workflow@v0.3.0
pi install git:github.com/phdgil/pi-solar-workflow@v0.3.0
pi list
```

Do not guess the old tag or remove a different registration. Removing the old package registration does **not** require deleting authentication keys, model settings, project files, or saved sessions. In an open pi session, run `/reload` after the update. If pi was restarted, use `/resume` to reopen the existing conversation.

If an older experimental setup manually copied or separately registered resources, remove those duplicate registrations and install the current package rather than keeping two discovered copies. Current discovery and UI expose only the four canonical `solar-*` skills and Solar-branded commands; historical Lite command names are not registered. Do not delete session history or project content.

## 4. Local checkout

Use the current development checkout to exercise the Unreleased controller. Substitute its actual permanent location:

```powershell
pi install "C:\path\to\pi-solar-workflow"
```

An already-installed legacy folder may remain named `pi-solar-lite`; do not move it merely for branding. A local installation loads the checkout directly, including future changes. Do not enable the local checkout and a Git installation together. The extension in this checkout owns workflow state, exact-revision approval, bounded detours, and evidence gates. Approved gate commands execute with the user's permissions.

Installing or updating the package is a separate deployment decision; source implementation approval does not authorize it. After an approved deployment, resolve the exact package location and compare every path in the source `package.json.files` list with the installed target. For example:

```powershell
Get-FileHash -Algorithm SHA256 "<source-checkout>\runtime\extension.ts"
Get-FileHash -Algorithm SHA256 "<installed-package>\runtime\extension.ts"
```

Repeat for every shipped runtime, skill, documentation, script, example, and notice file. A local in-place registration must resolve to the reviewed checkout; a copied or Git installation must have matching paths and bytes. Do not patch the installed pi SDK or GJC, and do not treat matching package names or versions as a substitute for matching hashes.

## 5. Choose a provider and model

Use pi's normal `/model` and `/thinking` controls to select the configured Upstage `solar-pro4` model and **Max** thinking before starting. Verify both again after `/resume`, which may restore a conversation-specific selection. The controller requires the same provider/model/thinking identity for the main stage role and creates fresh, tool-free Solar Max sessions for Planner, Approach Reviewer, and Critic. A missing or mismatched role blocks; it does not fall back to another model.

The child adapter requires pi 0.85.1's in-memory session/settings managers, disabled retry and compaction policy, empty built-in/custom tool lists, and disabled extension/skill/template/context-file discovery. It must stop rather than restore read tools, call raw Upstage HTTP, or guess unsupported settings. Each SDK session attempt has one 180,000 ms creation-plus-prompt deadline; the defaults of 12 role calls, 3 role repairs, and 3 review revisions count Pi SDK session attempts, not HTTP requests, retries, tokens, throughput, billing, or provider quotas. The three role contexts remain correlated same-model review signals, not independent proof.

For classroom Upstage API keys, use the session-only PowerShell helper below, **not** the persistent `/login` API-key menu. OAuth login is a separate credential flow. The package does not install credentials, change an account, or save startup defaults.

If the required model is not already configured, users may use the credential-free [`examples/models.upstage.json`](../examples/models.upstage.json) as a merge reference. It does not automatically select Solar, supply access, or guarantee model output quality.

If using the optional Upstage example:

- Preserve any working configuration. If `~/.pi/agent/models.json` already exists, back it up and merge only the required `providers.upstage` settings; do not replace other providers, credentials, models, or headers.
- The example omits `apiKey`; the helper supplies `UPSTAGE_API_KEY` only while pi runs. Do not save the classroom key using `/login`, `auth.json`, `.env`, `setx`, or User/Machine environment variables. Stored Upstage API keys take priority over pi's environment, so the helper stops on a conflict rather than silently using a previous key or deleting credentials.
- Its `thinkingLevelMap` explicitly maps pi's Max selection to the request payload. This is the required workflow model mapping, not a general provider contract.

Pi's model and credential behavior is documented in the pi 0.85.1 [Custom Models](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/models.md) and [settings](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/settings.md) references. Catalogs, payloads, and entitlements can change.

## 6. Reload and check installation

After installation or an update in the current pi session, run:

```text
/reload
```

Use `/resume` only after restarting pi or reopening a saved conversation. Then confirm:

- Typing `/skill:solar-` offers `solar-research`, `solar-interview`, `solar-plan`, and `solar-execute`.
- `/model` shows Upstage `solar-pro4` and `/thinking` shows Max; any other main-role selection must block the workflow rather than fall back.
- `/solar-interview status` reports no active assessment or the resumed assessment without starting inference.
- `/solar-workflow status` shows the current stage plus budgets, detours, and steps.
- The model has only the stage-appropriate workflow tools, including `solar_research_ready`, `solar_interview_round`, `solar_plan_ready`, `solar_revisit`, or `solar_step_done` when applicable.

Only the Solar-branded names are registered in the current checkout. Existing Lite-era content and conversation history remain readable; internal saved `solar-*` and `lite-output-snapshot-v1` identifiers remain unchanged. An unsupported active persisted contract version pauses with an actionable error instead of silently migrating or dispatching under stale authority.

Use [research -> interview -> plan -> execute](WORKFLOW.md) in the same conversation and task folder. At `awaiting_goal_confirmation`, normal interview closure requires the exact displayed command:

```text
/solar-interview confirm <12-character-lowercase-hex-token>
```

Any new answer or research invalidates that token. `/solar-interview finish` is instead a labeled early finish at any advisory score: it preserves open, contradictory, deferred, and stale items and grants a planning handoff only. `/solar-interview finish plan-only` also removes the later execution path.

`solar_plan_ready` starts validation and the separate Planner, Approach Reviewer, and Critic cycle; it does not execute. Approve only when `/solar-workflow status` reports `awaiting_gate_review` and displays the exact current reviewed revision token:

```text
/solar-workflow approve <revision>
```

A research-only request ends at `research_complete`; a fully reviewed planning-only request ends at `planning_complete` with no approval token or execute path. Material review findings use `revision_required` and require revision plus both re-reviews. During role review, status may be `reviewing_plan`. A qualitative final stops at `awaiting_final_review`; after reviewing current evidence, use only the exact displayed `/solar-workflow accept <revision>` token. Changed plan, artifact descriptors, finals, or evidence invalidate old approval or acceptance. Before continuing restarted work, use `/resume` rather than starting a fresh interview; resume grants no new approval.

## Research API keys

The Unreleased checkout reads these variables from the pi process environment:

| Variable | Purpose |
| --- | --- |
| `TAVILY_API_KEY` | Public web search and HTML page reading. |
| `UNSTRUCTURED_API_KEY` | Structured extraction of public PDF/Office documents returned by search. |
| `UNSTRUCTURED_API_URL` | Optional account-provided direct Partition URL; default `https://api.unstructuredapp.io/general/v0/general`. |

Unstructured's direct Partition API is **legacy but supported**. This adapter intentionally uses one-file multipart uploads, not Pipelines/jobs. Use the direct URL supplied with your account; `https://platform.unstructuredapp.io/api/v1` is a different API and will be rejected. Custom endpoints must be HTTPS Unstructured service hosts with the `/general/v0/general` path. See the [official direct request guide](https://docs.unstructured.io/api-reference/legacy-api/partition/post-requests).

Configuring a key or observing it with `/solar-web` does not by itself authorize a live request. Live Solar, Tavily, Unstructured, and frozen baseline/candidate runs require separate explicit authorization after deterministic verification; deployment approval does not imply live-service approval.

## Windows session-only API keys

The optional scripts in the **current checkout** keep Upstage, Mindlogic, Tavily, and Unstructured keys in the current PowerShell window. They are not present in the historical v0.3.0 tag.

Run this once from the reviewed checkout, then **continue in this same PowerShell window**:

```powershell
& "C:\path\to\pi-solar-workflow\scripts\Install-Session-Commands.ps1"
pi
```

The installer imports the helper into the current session and adds an import-only block to the current user's Windows PowerShell and PowerShell 7 all-host profiles. It copies code to LocalAppData, not credentials. It preserves other profile content and does not change User/Machine execution policy. If institutional policy blocks unsigned profiles, the instructor must arrange an allowed/signed setup first. For a reviewed script blocked only by the local default policy, `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` affects only that window; it cannot override organizational policy.

The normal `pi` command privately asks for Upstage and optional Tavily/Unstructured keys. `gjc` additionally asks for Mindlogic when installed. Management commands such as `pi install` or `--version` do not prompt for keys.

- Keys are held in module-private `SecureString` memory until cleared or the PowerShell window closes.
- Only the launched application's process environment receives the cached values. The helper restores the previous parent-process environment in `finally`.
- Continue work in the window where keys were entered. Another window needs fresh input. The classroom package's single `01-Install.cmd` keeps installation, all key prompts, checks, and subsequent work in **one persistent PowerShell window**.
- Use PowerShell `pi`/`gjc`, not raw `pi.cmd`/`gjc.exe`, which bypass the helper. Profile loading must be enabled for automatic wrapping in new windows.
- A normal application exit retains the window's in-memory cache for the next launch; it does not persist it to disk.
- Existing personal persistent keys are not automatically removed. Stored pi Upstage credentials or conflicting GJC API credentials/`.env` require separate instructor cleanup before protected launching. Do not copy or print their values.
- This is not a sandbox: applications and tools running as the same user can access process secrets. OAuth token storage is separate and is not made temporary by this helper.

In the **same PowerShell window**, after leaving the application:

```powershell
Get-ClassroomSessionKeyStatus
Set-ClassroomSessionKeys -Service Upstage
Set-ClassroomSessionKeys -Service Tavily
Set-ClassroomSessionKeys -Service Unstructured
pi
```

Status displays only presence. Key setters use hidden input, never a key argument. To change the official Unstructured direct endpoint for a launch, use `pi -UnstructuredApiUrl <official-partition-url>`; the endpoint is non-secret and must pass the adapter's HTTPS/service/path checks.

To end the API-key session:

```powershell
Clear-ClassroomSessionKeys
```

Then close PowerShell. `/reload` reloads code/skills but cannot import new keys from a parent shell. To change a running application's credentials, exit it, set the key in the same shell, relaunch, and `/resume` the conversation. Run `/solar-web` inside pi to check research-key presence; `/solar-workflow resume` can continue a paused research stage.

The helper does not log out OAuth accounts. On shared PCs, use Chrome **Guest** for browser login, verify the Guest badge, and copy the displayed official authentication URL there instead of signing into an automatically opened personal profile. Closing Guest clears browser data, **not CLI OAuth tokens**: log out from every CLI before leaving. See [Chrome's official Guest guide](https://support.google.com/chrome/answer/6130773?hl=ko).

Tavily receives public search terms and URLs. Unstructured receives the retrieved public document bytes. Do not upload confidential/local documents through these tools. No new SDK installation is needed. Ordinary Tavily page research works without an Unstructured key; document extraction requires it. Per-pass call bounds and extraction timeouts are local safeguards, not provider quota claims.

## Updates, interruptions, and removal

- Version-pinned Git installations do not automatically move to a newer tag. Use `pi list`, remove the exact registered source, install the desired exact source, then `/reload` the current session or restart pi and `/resume` the conversation.
- Runtime helpers use `.ts` imports to avoid native-ESM cache mismatches. Use `/reload` after an in-session update; restart and `/resume` after an interrupted process.
- While a question is being assessed, wait. Bounded repair handles malformed reports. `/solar-interview retry` reassesses the saved answer; `status` is read-only.
- Normal interview closure uses `/solar-interview confirm <current-token>` only at current readiness. `/solar-interview finish` is explicit early closure; neither closure mode grants execution without a fully reviewed plan and exact `/solar-workflow approve <revision>`.
- `/solar-workflow stop` saves state. `/solar-workflow resume` resumes only the already authorized stage. Use `/solar-workflow limits cycles=N detours=N turns=N` to adjust bounded defaults of 3, 8, and 120.
- Direct Upstage Solar Pro4 requests retry only genuine HTTP 429 responses. This optional provider-specific behavior does not retry every network error, remove provider limits, or apply a local token/RPM/TPM quota.
- Installing, updating, or removing a package requires separate deployment authorization. After installation/update, compare the complete source and installed manifests before `/reload`; do not infer byte identity from a version label.
- Remove a Git installation by passing its exact `pi list` source to `pi remove`, then restart pi. For a local installation, pass its installed path. Package removal does not delete saved conversations or project outputs.
