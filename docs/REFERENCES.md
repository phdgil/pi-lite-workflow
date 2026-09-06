# References, provenance, and license audit

Checked 2026-09-06. This records the projects considered before building the skills and the public interfaces used by the Windows controller. A documentation, source, or exported-type review is not a successful Solar/Windows integration test. Links use the reviewed versions or snapshots where available; version tags are not immutable guarantees.

## Community components evaluated before implementation

| Project and inspected version | What informed the design | Decision for this release | License evidence |
| --- | --- | --- | --- |
| [pi-code-planner 0.12.2](https://github.com/m62624/pi-code-planner/tree/v0.12.2) | Persistent staged coding, saved questions/decisions, coverage gates, recovery, worktrees; explicitly experimental. | Not bundled. Its inspected Git/commit lifecycle and larger command surface were not adopted. | [MIT; Copyright 2026 Mansur](https://raw.githubusercontent.com/m62624/pi-code-planner/v0.12.2/LICENSE) |
| [pi-autoresearch 1.7.0](https://github.com/davebcn87/pi-autoresearch/tree/v1.7.0) | Measured experiments, logged results, keep/revert cycles, bounded failure/iteration handling. | Design reference only. The lightweight research skill is not a port of its experiment loop. Bash/rollback behavior was not validated on native PowerShell with Solar. | [MIT; Tobi Lütke and David Cortés notices](https://raw.githubusercontent.com/davebcn87/pi-autoresearch/v1.7.0/LICENSE) |
| [@piex-dev/goal 0.1.0](https://github.com/piex-dev/piex/tree/9d783dc9a999fe5b9d5b9218697d3a20d14b8bf0/extensions/goal) | Persistent continuation, settled-idle dispatch, accounting, stale-request guards. | Pinned GoalRuntime source was reused in a separate local controller pilot, **not** this release. The controller and vendored source are excluded. | [MIT; Copyright 2026 debugtalk](https://raw.githubusercontent.com/piex-dev/piex/9d783dc9a999fe5b9d5b9218697d3a20d14b8bf0/LICENSE) |
| [pi-interview 0.12.0](https://github.com/nicobailon/pi-interview-tool/tree/v0.12.0) | Structured question collection and recoverable interview responses; not a complete long-running loop. | Evaluated only; no dependency or copied source. The current interview UI/state implementation is separate. | [MIT declared in package metadata](https://raw.githubusercontent.com/nicobailon/pi-interview-tool/v0.12.0/package.json); no canonical root LICENSE found at the tag. |

The planner's `elenchus-wasm` and `tree-kill` dependencies were noted during metadata/source inspection, not installed, reused, or separately compatibility-tested. No community loop controller is activated alongside the shipped interview runtime. Upstream packages and their transitive dependencies are not included in the release archive.

## Workflow and interview design sources

| Source | Role and boundary | License evidence |
| --- | --- | --- |
| [Ouroboros Korean README](https://github.com/Q00/ouroboros/blob/03714ba446186423dcb46e25d12bd19c3a2e82f6/README.ko.md), [ambiguity implementation](https://github.com/Q00/ouroboros/blob/03714ba446186423dcb46e25d12bd19c3a2e82f6/src/ouroboros/bigbang/ambiguity.py) | Socratic intention clarification, exposing assumptions, and evidence-based clarity dimensions rather than an implementation checklist. The adapted score is not a calibrated measurement. | [MIT; Copyright 2025 Q00](https://raw.githubusercontent.com/Q00/ouroboros/03714ba446186423dcb46e25d12bd19c3a2e82f6/LICENSE) |
| [Gajae Code / GJC](https://github.com/Yeachan-Heo/gajae-code/tree/9d2176a04291e9126b053786b84676881941174c/packages/coding-agent/src/defaults/gjc/skills), especially deep-interview, ralplan, autoresearch, and ultragoal | User experience and source references for interview scoring, intention handoff, plan/design/critic review, and verified execution. We adapt the purpose, not the full harness/API/authority protocol. GJC's deep-interview source credits Ouroboros. | [MIT; Copyright 2025-2026 Yeachan-Heo and Gajae Code Contributors](https://raw.githubusercontent.com/Yeachan-Heo/gajae-code/9d2176a04291e9126b053786b84676881941174c/LICENSE) |
| [oh-my-codex / OMX](https://github.com/Yeachan-Heo/oh-my-codex/tree/2da36489cfa07ef1df802f01865e7d959d36f236) | Orchestration background/development environment; not installed or invoked by these skills, and no OMX source is bundled. | [MIT declared in package metadata](https://raw.githubusercontent.com/Yeachan-Heo/oh-my-codex/2da36489cfa07ef1df802f01865e7d959d36f236/package.json); no canonical root LICENSE found at this snapshot. |

Research-first is the workflow chosen for this package, not a claim that upstream GJC mandates this sequence. The historical Ralph-loop lineage discussed during development was not separately established; this release does not claim to implement or license an unspecified Claude/Ralph repository.

## Runtime dependencies supplied by pi

| Component | Usage | Audited license |
| --- | --- | --- |
| [@earendil-works/pi-coding-agent 0.85.1](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/package.json) | Host extension API, tool/session events, UI, package discovery, and the public SDK used for role sessions. | [MIT; Mario Zechner](https://raw.githubusercontent.com/earendil-works/pi/v0.85.1/LICENSE) |
| [@earendil-works/pi-tui 0.85.1](https://github.com/earendil-works/pi/blob/v0.85.1/packages/tui/package.json) | Text components, wrapping, and theme-aware display. | [MIT; Mario Zechner](https://raw.githubusercontent.com/earendil-works/pi/v0.85.1/LICENSE) |
| [TypeBox 1.3.7](https://github.com/sinclairzx81/typebox/tree/1.3.7) | Tool parameter schemas. This is `typebox`, not the older `@sinclair/typebox` package name. | [MIT; Haydn Paterson](https://raw.githubusercontent.com/sinclairzx81/typebox/1.3.7/license) |

These are declared as optional peers because Pi supplies them to extensions; the package does not download or bundle a second host. Pi 0.85.1 is the implementation target even though the peer range follows Pi's documented `*` convention. Node built-ins provide the remaining mechanics; there are no added third-party runtime dependencies.

## Pi 0.85.1 SDK and exported type surface

The role-session design is grounded in Pi 0.85.1's public source and the matching exported declarations supplied by the installed package, not an unsupported patch or an inference from private runtime behavior:

| Official Pi 0.85.1 surface | Contract used |
| --- | --- |
| [`sdk.ts`](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/sdk.ts) | `createAgentSession` options for an explicit model, thinking level, `tools:[]`, resource loader, settings manager, and session manager. |
| [`resource-loader.ts`](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/resource-loader.ts) | `DefaultResourceLoader` flags that disable extension, skill, prompt-template, and context-file discovery. |
| [`session-manager.ts`](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/session-manager.ts) | `SessionManager.inMemory(...)` for a fresh nonpersistent conversation. |
| [`settings-manager.ts`](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/settings-manager.ts) | `SettingsManager.inMemory(...)` and declared retry/compaction settings without modifying user settings. |
| [`agent-session.ts`](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/agent-session.ts) | Public session state/system-prompt access plus `prompt`, `abort`, and `dispose` lifecycle methods. |

These declarations establish which API may be implemented against; they do not prove creation, cancellation, cleanup, Solar output quality, or Windows integration. Those behaviors require deterministic fake-session/lifecycle checks and separately authorized live evidence. The package must stop if the installed supported surface differs; it must not patch the installed SDK, invent settings keys, use raw Upstage HTTP as a role-session fallback, or change GJC.

## Hosted research APIs

- [Tavily search](https://docs.tavily.com/documentation/api-reference/endpoint/search) and [extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract): native JSON requests with private bearer authentication, basic depth, bounded results, and partial-failure handling. No Tavily SDK code is bundled.
- [Unstructured direct Partition requests](https://docs.unstructured.io/api-reference/legacy-api/partition/post-requests), [parameters](https://docs.unstructured.io/api-reference/legacy-api/partition/api-parameters), and [document elements](https://docs.unstructured.io/api-reference/legacy-api/partition/document-elements): native multipart uploads for public documents. The direct API is legacy but supported; this is not the newer Pipelines API. No Unstructured library code is bundled.
- Hosted API access, uploaded data, retention, and usage charges are governed separately by the providers' terms; MIT grants no API credits or data-upload permission. See [Tavily privacy](https://www.tavily.com/privacy) and [Unstructured platform terms](https://unstructured.io/platform-terms-of-service). Documentation was checked on 2026-09-06; adapter bounds are not contractual service limits.

## MIT compatibility and limits of this audit

The audited direct references declare MIT; no conflicting direct copyleft requirement was identified for the selected release contents. [LICENSE](../LICENSE) covers original pi-solar-workflow work only. [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) preserves the full pi, TypeBox, Ouroboros, and GJC notices, including attribution for adapted design/instruction material.

Metadata-only MIT declarations for OMX and pi-interview do not supply missing copyright/permission texts. They are references only here: before copying or vendoring their source, obtain the canonical applicable notices. The local goal experiment's missing tarball notice was supplied from its upstream repository; neither its source nor controller is shipped here.

This is a source/distribution audit, not legal advice, a transitive-dependency audit of the whole pi application, or permission to redistribute model weights, API keys, proprietary data, trademarks, or hosted services. Future dependencies or copied source require a new review. Preserve applicable upstream notices rather than replacing every license with this project's MIT notice.
