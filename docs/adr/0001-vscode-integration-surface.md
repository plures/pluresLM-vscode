# ADR-0001: PluresLM VS Code Integration Surface

- Status: Proposed
- Date: 2026-07-23
- Epic: pluresLM:vscode-integration (P1 — DESIGN stage)
- Owners: pluresLM-vscode, pluresLM-mcp

## Context

`pluresLM-vscode` already ships a service-first extension (chat participant
`@memory`, LM tools, sidebar, status bar) that talks to `plureslm-service`
via JSON-RPC 2.0 over stdio using MCP `tools/call` framing
(`src/service-client.ts`). The canonical memory engine is `pluresLM-mcp`
(`src/server.ts`), which exposes ~28 MCP tools (store/search/forget/index,
list/get/update, procedures, packs/bundles, DSL query) over stdio or
Streamable HTTP, backed by PluresDB with optional Hyperswarm P2P sync.

Today the extension surface and the MCP surface have drifted:

- Extension calls `plureslm_delete`, `plureslm_delete_source`, `plureslm_list`,
  `plureslm_stats` — none of these tool names exist on the current MCP server
  (`server.ts` exposes `pluresLM_forget`, `pluresLM_status`, `pluresLM_list`
  with different casing and slightly different shapes).
- Extension's `IMemoryProvider` interface assumes categories
  (`decision | preference | code-pattern | error-fix | architecture | other`)
  that are not enforced or reflected in the MCP tool schemas (MCP takes free-
  form `category: string`).
- There is no `.px` (Praxis) authoring/validation surface in the extension at
  all, despite pares-radix/praxis-lang being the org's standard rule/DSL
  language, and pluresLM-mcp already running a Praxis engine internally
  (`src/praxis/index.ts`) for tool authorization/validation/routing.
- There is no "agent invoke" surface distinct from the LM tools — i.e. no way
  for a user or automation to directly invoke a pluresLM-mcp procedure
  (`pluresLM_run_procedure`) or Praxis-gated action from the editor UI.
- QA today (`docs/qa/service-mode-qa.md`) is Vitest + mocked
  `plureslm-service` child process. There is no test harness that runs
  against the real `pluresLM-mcp` binary channel-independently (stdio vs
  HTTP), so regressions in the tool-name contract (as above) are not caught.

This ADR is DESIGN-ONLY. It defines the target extension surface, backend
reuse strategy, auth/security model, and QA approach. No implementation
lands as part of this ADR; follow-up PRs implement each surface behind
feature flags, each with its own tests.

## Decision

### 1. Extension surface (three pillars)

The extension will expose exactly three first-class capability groups,
each independently toggleable via `package.json` `contributes` and
settings:

**A. Search / Store (existing, contract-fixed)**
- Keep `@memory` chat participant (`/recall`, `/store`, `/forget`,
  `/stats`, `/index`) as the primary conversational surface.
- Keep LM tools `plureslm_search_text` / `plureslm_store` as the
  Copilot-agent-mode surface. Retire `superlocalmemory_*` aliases on the
  v0.4 boundary already documented in README — no change to that plan.
- **Fix the contract drift**: `IMemoryProvider`/`PluresLMServiceClient`
  method-to-tool-name mapping must be pinned to a versioned tool
  manifest fetched from the service at `initialize` time (MCP
  `tools/list`), not hardcoded string literals scattered across
  `service-client.ts`. This closes the `plureslm_delete` /
  `plureslm_delete_source` / `plureslm_stats` mismatch class of bug
  before any new surface is added.

**B. `.px` (Praxis) authoring/validation**
- New: a `.px` language contribution (syntax highlighting via TextMate
  grammar sourced from `praxis-lang`'s canonical grammar export, not
  hand-maintained) plus a "Validate .px" command and a
  save-time diagnostic pass.
- Validation runs **out-of-process** via the same canonical parser used
  by `px-authoring` skill (`px-napi` `parse()`), invoked as a child
  process/CLI (`validate-px-grammar.cjs`-equivalent packaged artifact),
  never a re-implemented grammar inside the extension. The extension
  ships a thin wrapper that shells out to a pinned `praxis-lang` CLI/napi
  build; version is locked in `package.json` (`praxisLangVersion`) and
  checked at activation with a clear error if mismatched.
- Scope for v1: diagnostics (parse errors + constraint-lint from
  `pluresLM-mcp`'s `src/praxis/modules/*` rule shapes) and hover/go-to
  for `entity`/`constraint`/`procedure` blocks. No `.px` execution inside
  the extension — execution stays server-side in `pluresLM-mcp`.

**C. Agent invoke**
- New: a command + sidebar action, "PluresLM: Run Procedure", that lists
  procedures via `pluresLM_list_procedures` and invokes
  `pluresLM_run_procedure` with a user-supplied JSON context, surfaced as
  a QuickPick + input box (no free-form arbitrary tool invocation from
  the UI — only named, pre-registered procedures, to keep the Praxis
  authorization/constraint gate meaningful).
- LM tool `plureslm_run_procedure` is **not** auto-exposed to Copilot
  agent mode by default (opt-in setting
  `superlocalmemory.agentInvoke.exposeAsTool`, default `false`) because procedures
  can have side effects (store/update/delete); default posture is
  human-in-the-loop via command palette, matching existing
  confirmation-prompt patterns used for pack/bundle restore.

### 2. Backend reuse

- The extension does **not** reimplement any storage, embedding, Praxis,
  or procedure logic. `pluresLM-mcp` remains the single backend; the
  extension is a thin MCP client plus editor-native UX (sidebar, status
  bar, `.px` diagnostics, command palette).
- Legacy SQLite/Transformers.js local mode remains opt-in
  (`superlocalmemory.mode = "legacy"`) for offline-without-service use,
  but is explicitly out of scope for the three new pillars (B and C are
  service-mode only — legacy mode has no procedure engine or Praxis
  engine to invoke).
- `.px` validation reuses `praxis-lang`'s published parser artifact
  directly; it does not go through `pluresLM-mcp` at all (parsing is a
  static, local, offline operation). Praxis **constraint metadata**
  (rule names bound to tool calls) is fetched from `pluresLM-mcp` at
  runtime via a new lightweight introspection call (see Open Question 1)
  so hover/lint can show live constraint names instead of guessing from
  static `.px` files bundled with the extension.

### 3. Auth / security

- **Transport parity, not divergence**: the extension must support the
  same two transports `pluresLM-mcp` supports — stdio (local, default,
  trusted-by-process-ownership) and Streamable HTTP (remote, requires
  `x-api-key`). Today `service-client.ts` only implements stdio spawn;
  this ADR requires a second `IMemoryProvider` implementation,
  `PluresLMHttpClient`, gated by
  `superlocalmemory.serviceTransport: "stdio" | "http"`, before agent
  invoke or `.px` live-constraint lookup ship for remote/team use.
- **Secrets**: `MCP_API_KEY` (HTTP mode) and `PLURES_DB_SECRET` /
  `PLURES_DB_TOPIC` (mesh identity, effectively a shared secret — anyone
  holding the topic key has full read/write) must never be stored in
  `settings.json` (workspace-shared, often committed). They go in VS
  Code `SecretStorage` (`context.secrets`), keyed by transport
  target, with a settings field only holding a *reference* (e.g. the
  host:port or a labeled secret id), matching the pattern already used
  by `entra-app-registration`/Azure skills in this org for credential
  handling.
- **Least privilege for agent invoke**: because `pluresLM_run_procedure`
  can execute arbitrary stored steps including `store`/`update`/`delete`,
  the extension enforces a confirmation prompt whenever a procedure's
  steps include a mutating kind, mirroring the existing bundle-restore
  confirmation UX. This is a client-side courtesy gate — the real
  authorization boundary is `pluresLM-mcp`'s Praxis
  `tool-authorization.ts` module, which the extension must not attempt
  to bypass or duplicate.
- **`.px` validator process isolation**: the validator subprocess is
  spawned with no network access assumptions and no PluresDB
  credentials in its env — it is a pure parser, and must not be handed
  `PLURES_DB_TOPIC`/`PLURES_DB_SECRET`/`MCP_API_KEY` env vars.

### 4. Local, channel-independent QA

Today's QA (`docs/qa/service-mode-qa.md`) mocks `plureslm-service`'s
JSON-RPC responses in-process. That catches extension-side logic bugs
but would **not** have caught the tool-name drift described in Context,
because the mock defines its own tool names rather than asserting
against the real server's `tools/list`.

New QA requirements (still design-only — implementation is a follow-up):

1. **Contract test, channel-independent**: a test suite that starts a
   real `pluresLM-mcp` instance (in-process import or spawned child,
   whichever channel — stdio or HTTP — is under test) against a scratch
   PluresDB topic, calls `tools/list`, and asserts every tool name the
   extension references in `service-client.ts`/`tools.ts` exists in that
   list with a compatible input schema. This test must run identically
   whether the transport is stdio or HTTP (parameterized over both), so
   a regression in either channel is caught the same way. This directly
   targets the drift bug found during this design pass.
2. **`.px` validation golden tests**: fixture `.px` files (valid and
   intentionally invalid) checked into `docs/adr/fixtures/px/`, run
   through the pinned validator CLI in CI, asserting exit codes and
   diagnostic ranges — independent of any VS Code API mocking.
3. **Agent invoke smoke test**: given a fixture procedure with a
   mutating step, assert the confirmation prompt path is exercised
   (existing `src/test/mocks/vscode.ts` pattern) and that invocation is
   blocked without confirmation.
4. All three run via `npm test` (Vitest) exactly as today — no new test
   runner — but are organized as a `qa:contract`, `qa:px`, `qa:invoke`
   script split so CI can report which pillar regressed.

## Open Questions (to resolve before implementation PRs)

1. Does `pluresLM-mcp` need a new lightweight tool (e.g.
   `pluresLM_praxis_constraints`) to expose constraint names/messages for
   live `.px` hover, or is static bundling of the org's canonical
   constraint set acceptable for v1? Leaning: add the tool — it's cheap
   and keeps the extension from re-vendoring Praxis rule text.
2. `PluresLMHttpClient` scope: v1 (ship with pillars B/C) or v1.1
   (stdio-only for B/C, HTTP client as fast-follow)? Leaning: HTTP client
   should land in the same epic before agent-invoke ships broadly, since
   team/shared-memory scenarios are exactly where mutating procedures
   are most likely to be used.
3. Where does the pinned `praxis-lang` parser artifact get published for
   VS Code extension consumption (npm package vs. bundled native
   binary per-platform)? This affects `.vscodeignore`/packaging and must
   be resolved with the praxis-lang maintainers before implementation.

## Consequences

- Positive: closes an active correctness bug (tool-name drift) as a
  side effect of formalizing the contract; gives `.px` a first-class
  editor home consistent with org-wide Praxis investment; keeps all
  business logic server-side (auditable, single source of truth).
- Negative: HTTP client is now a hard prerequisite for two of three new
  pillars, adding scope before those pillars can ship completely; `.px`
  validator packaging/versioning adds a new release-train dependency
  (praxis-lang) to pluresLM-vscode.
- Neutral: no changes to legacy SQLite mode; no changes to existing
  `@memory` participant behavior.

## Non-Goals

- Implementing any of the above (this ADR is DESIGN stage only).
- Adding arbitrary/ad-hoc tool invocation UI (only named, pre-registered
  procedures are invocable from the UI).
- Running `.px` procedures inside the extension process.
