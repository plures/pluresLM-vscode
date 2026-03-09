# Service-Mode QA Regression Suite

Runnable QA matrix for **pluresLM-vscode** service-mode behavior.  
All checks are automated via `npm test` (vitest).  
Manual checks are marked **[MANUAL]**.

> **Architecture note (PR #14):** Default mode is now service-first (`plureslm-service` MCP/stdio).
> Legacy SQLite mode is opt-in via `superlocalmemory.mode: "legacy"`.
> Primary LM tool names are `plureslm_search` / `plureslm_store`; legacy aliases
> (`superlocalmemory_search` / `superlocalmemory_store`) remain for one release cycle.

---

## How to run

```bash
# Install dependencies (first time)
npm install

# Run the full regression suite
npm test

# Watch mode during development
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## QA Matrix

### 1. Startup — Service Available / Unavailable

| # | Scenario | Test file | Status |
|---|----------|-----------|--------|
| S1 | Service starts with zero memories | `startup.test.ts` | automated |
| S2 | `stats()` returns zero-filled struct on fresh service | `startup.test.ts` | automated |
| S3 | `search()` returns empty array on fresh service | `startup.test.ts` | automated |
| S4 | `store()` throws a clear error when the service is faulted | `startup.test.ts` | automated |
| S5 | `count()` and `stats()` remain usable when store is faulted | `startup.test.ts` | automated |
| S6 | `search()` throws when search index is unavailable | `startup.test.ts` | automated |
| S7 | `store()` still works when only search is faulted | `startup.test.ts` | automated |
| S8 | `search()` returns empty when service is in empty mode | `startup.test.ts` | automated |
| S9 | Multiple stores are cumulative (not reset) | `startup.test.ts` | automated |
| S10 | `ensureInitialized()` resolves without throwing on fresh service | `startup.test.ts` | automated |
| S11 | `ensureInitialized()` is idempotent (safe to call multiple times) | `startup.test.ts` | automated |
| S12 | `close()` does not throw on active service | `startup.test.ts` | automated |
| S13 | Store succeeds after `ensureInitialized()` | `startup.test.ts` | automated |
| S14 | `stats()` available immediately after `ensureInitialized()` | `startup.test.ts` | automated |
| S15 | Service mode: provider initialises without SQLite dependency | `startup.test.ts` | automated |
| S16 | Legacy mode fallback when `plureslm-service` not found | `startup.test.ts` | automated |
| S17 | Service mode `store` follows `plureslm_store` param contract | `startup.test.ts` | automated |
| S18 | Service mode `search` follows `plureslm_search` param contract | `startup.test.ts` | automated |
| S19 | `stats()` shape matches `plureslm_stats` response contract | `startup.test.ts` | automated |
| S20 | **[MANUAL]** Extension activates without crash when `~/.superlocalmemory/` does not exist | — | manual |
| S21 | **[MANUAL]** Extension shows status bar item within 5 s of activation | — | manual |
| S22 | **[MANUAL]** Output channel logs "Service mode active." when `plureslm-service` is available | — | manual |
| S23 | **[MANUAL]** Output channel logs fallback warning when `plureslm-service` is not installed | — | manual |

---

### 2. Store / Search / Stats / List Flows

| # | Scenario | Test file | Status |
|---|----------|-----------|--------|
| F1 | `store()` returns a `MemoryEntry` with UUID, content, category, source, tags | `store-search-stats.test.ts` | automated |
| F2 | `count()` increments after each unique store | `store-search-stats.test.ts` | automated |
| F3 | All 6 valid categories are accepted | `store-search-stats.test.ts` | automated |
| F4 | `created_at` is set to roughly the current timestamp | `store-search-stats.test.ts` | automated |
| F5 | `search()` returns ranked results matching the query | `store-search-stats.test.ts` | automated |
| F6 | Search results are sorted by score descending | `store-search-stats.test.ts` | automated |
| F7 | `limit` parameter caps result count | `store-search-stats.test.ts` | automated |
| F8 | `search()` returns empty when nothing matches | `store-search-stats.test.ts` | automated |
| F9 | `stats().totalMemories` reflects actual count | `store-search-stats.test.ts` | automated |
| F10 | `stats().categories` has correct per-category counts | `store-search-stats.test.ts` | automated |
| F11 | `stats().lastCaptureTime` is set after at least one store | `store-search-stats.test.ts` | automated |
| F12 | `listByCategory()` returns only matching entries | `store-search-stats.test.ts` | automated |
| F13 | `listBySource()` returns only entries from that source | `store-search-stats.test.ts` | automated |
| F14 | `listByTag()` returns only entries with that tag | `store-search-stats.test.ts` | automated |
| F15 | `listAllTags()` returns distinct tags with occurrence counts | `store-search-stats.test.ts` | automated |
| F16 | `listByDateRange()` includes entries within the range | `store-search-stats.test.ts` | automated |
| F17 | `listByDateRange()` excludes entries outside the range | `store-search-stats.test.ts` | automated |
| F18 | `listSources()` returns distinct sources with counts | `store-search-stats.test.ts` | automated |
| F19 | List results do not expose the `embedding` field | `store-search-stats.test.ts` | automated |
| F20 | `forgetByQuery()` removes matching entries | `store-search-stats.test.ts` | automated |
| F21 | `forgetByQuery()` returns 0 when nothing matches | `store-search-stats.test.ts` | automated |
| F22 | `forgetById()` removes specific entry | `store-search-stats.test.ts` | automated |
| F23 | `forgetById()` returns false for unknown ID | `store-search-stats.test.ts` | automated |
| F24 | `deleteSource()` removes all entries for a source | `store-search-stats.test.ts` | automated |
| F25 | `deleteSource()` returns 0 for unknown source | `store-search-stats.test.ts` | automated |
| F26 | **[MANUAL]** Memory Stats command opens a markdown document | — | manual |
| F27 | **[MANUAL]** Browse Knowledge sidebar shows stored entries | — | manual |

---

### 3. Chat Participant Tool Usage

| # | Scenario | Test file | Status |
|---|----------|-----------|--------|
| C1 | `/recall <query>` routes to `search()` and streams results | `chat-participant.test.ts` | automated |
| C2 | `/recall <query>` shows no-match message when nothing found | `chat-participant.test.ts` | automated |
| C3 | `/recall` without args returns usage hint | `chat-participant.test.ts` | automated |
| C4 | Result markdown includes category name | `chat-participant.test.ts` | automated |
| C5 | `/store <text>` routes to `store()` and streams stored ID | `chat-participant.test.ts` | automated |
| C6 | `/store` without args returns usage hint | `chat-participant.test.ts` | automated |
| C7 | `/store` propagates service errors as markdown | `chat-participant.test.ts` | automated |
| C8 | `/forget <query>` routes to `forgetByQuery()` and streams count | `chat-participant.test.ts` | automated |
| C9 | `/forget` without args returns usage hint | `chat-participant.test.ts` | automated |
| C10 | `/stats` streams total memory count and edge count | `chat-participant.test.ts` | automated |
| C11 | Unknown command streams help text listing all commands | `chat-participant.test.ts` | automated |
| C12 | `parseSlashCommand` parses `/command args` correctly | `chat-participant.test.ts` | automated |
| C13 | `parseSlashCommand` accepts command without leading slash | `chat-participant.test.ts` | automated |
| C14 | **[MANUAL]** `@memory /recall typescript` responds in Copilot Chat panel | — | manual |
| C15 | **[MANUAL]** `@memory /index` indexes project and reports file counts | — | manual |

---

### 4. MCP Pack Operations (LM Tools / Copilot Agent Mode)

> **Service-mode alignment:** Primary tool names are `plureslm_search` / `plureslm_store`.
> Legacy aliases `superlocalmemory_search` / `superlocalmemory_store` remain for one release.

| # | Scenario | Test file | Status |
|---|----------|-----------|--------|
| T1 | `SearchMemoryTool` returns formatted text when memories match | `lm-tools.test.ts` | automated |
| T2 | `SearchMemoryTool` returns "No matching memories." when empty | `lm-tools.test.ts` | automated |
| T3 | `SearchMemoryTool` result has exactly one text part | `lm-tools.test.ts` | automated |
| T4 | Long content is truncated at 400 characters with ellipsis | `lm-tools.test.ts` | automated |
| T5 | Score is shown as percentage in output | `lm-tools.test.ts` | automated |
| T6 | `SearchMemoryTool` propagates search errors | `lm-tools.test.ts` | automated |
| T7 | `StoreMemoryTool` stores memory and returns ID in result | `lm-tools.test.ts` | automated |
| T8 | `StoreMemoryTool` forwards category to store | `lm-tools.test.ts` | automated |
| T9 | `StoreMemoryTool` defaults category to "other" | `lm-tools.test.ts` | automated |
| T10 | `StoreMemoryTool` result has exactly one text part | `lm-tools.test.ts` | automated |
| T11 | `StoreMemoryTool` propagates store errors | `lm-tools.test.ts` | automated |
| T12 | Source is recorded as `vscode:lm-tool` | `lm-tools.test.ts` | automated |
| T13 | Sequential store calls accumulate without overwriting | `lm-tools.test.ts` | automated |
| T14 | Search after bulk store returns relevant entries | `lm-tools.test.ts` | automated |
| T15 | `deleteSource('vscode:lm-tool')` clears all LM-tool memories | `lm-tools.test.ts` | automated |
| T16 | `plureslm_search` is the primary search tool name | `lm-tools.test.ts` | automated |
| T17 | `plureslm_store` is the primary store tool name | `lm-tools.test.ts` | automated |
| T18 | `superlocalmemory_search` is registered as a legacy alias | `lm-tools.test.ts` | automated |
| T19 | `superlocalmemory_store` is registered as a legacy alias | `lm-tools.test.ts` | automated |
| T20 | Primary and alias tool produce identical results | `lm-tools.test.ts` | automated |
| T21 | MCP tool-call params (content, category) forwarded correctly | `lm-tools.test.ts` | automated |
| T22 | **[MANUAL]** Copilot agent mode invokes `plureslm_search` tool | — | manual |
| T23 | **[MANUAL]** Copilot agent mode invokes `plureslm_store` tool | — | manual |
| T24 | **[MANUAL]** Legacy `superlocalmemory_search` alias still works in agent mode | — | manual |

---

### 5. Migration / Legacy Toggle Behavior

| # | Scenario | Test file | Status |
|---|----------|-----------|--------|
| M1 | First-run records `embedding_dimension:384` in profile | `migration.test.ts` | automated |
| M2 | Dimension fact is not duplicated on repeated calls | `migration.test.ts` | automated |
| M3 | Default dimension 384 matches bge-small-en-v1.5 | `migration.test.ts` | automated |
| M4 | No mismatch warning when profile has no dimension fact | `migration.test.ts` | automated |
| M5 | No mismatch warning for null (empty DB) profile | `migration.test.ts` | automated |
| M6 | No mismatch warning when dimensions match | `migration.test.ts` | automated |
| M7 | Mismatch warning when dimensions differ (OpenAI → local) | `migration.test.ts` | automated |
| M8 | Mismatch warning on OpenAI → local downgrade (1536 → 384) | `migration.test.ts` | automated |
| M9 | Mismatch warning on local → OpenAI upgrade (384 → 1536) | `migration.test.ts` | automated |
| M10 | Legacy (no-embedding) memories appear in list results | `migration.test.ts` | automated |
| M11 | Legacy memories contribute to stats | `migration.test.ts` | automated |
| M12 | Legacy memories are listable by source | `migration.test.ts` | automated |
| M13 | Empty DB → store → count increments correctly | `migration.test.ts` | automated |
| M14 | `clear()` resets service to initial state | `migration.test.ts` | automated |
| M15 | Switching provider sets mismatch warning | `migration.test.ts` | automated |
| M16 | Same provider reused → no mismatch warning | `migration.test.ts` | automated |
| M17 | **[MANUAL]** Output channel shows ⚠️ dimension mismatch when switching from OpenAI to local model | — | manual |
| M18 | **[MANUAL]** "Memory: Index Project" re-indexes and resolves dimension mismatch | — | manual |

---

## Failure Triage Guide

### T001 — Tests fail to import mock modules

**Symptom:** `Cannot find module '../../service.types'` or similar  
**Cause:** `tsconfig.json` `rootDir` may not include test files, or alias is misconfigured  
**Fix:**
1. Confirm `vitest.config.ts` has the `vscode` alias pointing to `src/test/mocks/vscode.ts`
2. Run `npx tsc --noEmit` to check for compile errors outside the test runner

---

### T002 — `store()` never resolves / hangs

**Symptom:** Test times out in `store()` call  
**Cause:** Embedding model is being loaded (should not happen in tests; `InMemoryService` has no embedding dependency)  
**Fix:**
1. Ensure tests import from `./mocks/memory-service.mock`, not from `../../memory-provider`
2. If `MemoryProvider` is used directly in a test, mock `DualEmbeddings` via `vi.mock`

---

### T003 — Search always returns empty results

**Symptom:** `search()` returns `[]` even when matching entries exist  
**Cause:** Default `scoreFn` in `InMemoryService` returns `1.0` for everything but the test expects substring matching  
**Fix:** Pass a custom `scoreFn` to `InMemoryService`:
```typescript
const svc = new InMemoryService({
  scoreFn: (q, c) => c.toLowerCase().includes(q.toLowerCase()) ? 1.0 : 0.0
});
```

---

### T004 — `listByCategory` / `listByTag` return entries with `embedding` field

**Symptom:** Assertion `Object.keys(e)` contains `embedding`  
**Cause:** `InMemoryService` is not stripping the embedding field in list methods  
**Fix:** Confirm `InMemoryService.listByCategory` uses `({ embedding: _e, ...rest }) => rest` destructuring

---

### T005 — Service mode: `plureslm-service` not found at activation (manual)

**Symptom:** Output channel shows `Service unavailable (…). Falling back to legacy local mode.`  
**Cause:** `plureslm-service` binary is not installed or not on `PATH`  
**Steps to reproduce:**
1. Ensure `plureslm-service` is not installed: `which plureslm-service` returns nothing
2. Activate extension with default config (`superlocalmemory.mode: "service"`)
3. Expected: warning logged, extension continues in legacy SQLite mode  
**Fix:** Install the service (`npm install -g plureslm-service`) or set `superlocalmemory.mode: "legacy"` to explicitly use local mode

---

### T006 — Dimension mismatch detected on every startup (manual)

**Symptom:** Output channel shows `⚠️ Dimension mismatch` on every activation  
**Cause:** Profile `facts` array was not persisted after first-run recording  
**Steps to reproduce:**
1. Delete `~/.superlocalmemory/vscode.db`
2. Activate extension → no warning expected
3. Change `superlocalmemory.openaiApiKey` setting to a valid key → restart VS Code
4. Warning expected: `DB has 384-dim embeddings, now using 1536-dim`
5. Run "Memory: Index Project" to rebuild → warning should not appear next restart  
**Expected:** Warning shown exactly once per provider switch

---

### T007 — Chat participant `/recall` returns stale results (manual)

**Symptom:** `/recall` returns memories that were already deleted via `/forget`  
**Cause:** Possible cache in `MemoryProvider._instance` singleton  
**Steps to reproduce:**
1. `@memory /store test entry`
2. `@memory /forget test`
3. `@memory /recall test` — should say "No matching memories"  
**Fix:** Call `refreshAll()` after forget to invalidate sidebar + status bar

---

### T008 — LM tools not appearing in Copilot agent mode (manual)

**Symptom:** `plureslm_search` / `plureslm_store` not offered by Copilot  
**Cause:** VS Code version < 1.99 or the `vscode.lm.registerTool` API is absent  
**Fix:**
1. Confirm VS Code ≥ 1.99
2. Check output channel for errors during activation
3. Verify `package.json` `languageModelTools` contribution is present and matches tool names
4. The primary names are `plureslm_search` and `plureslm_store` (post PR #14)

---

### T009 — `deleteSource` deletes more entries than expected (manual)

**Symptom:** `deleteSource('vscode:index')` also removes `vscode:index:subfolder` entries  
**Cause:** SQLite `WHERE source = ?` is exact; unlikely.  Check if source strings were stored with unexpected prefixes  
**Steps to reproduce:**
1. Run "Memory: Index Project"
2. Check sidebar source list
3. Run `deleteSource('vscode:index')` via command palette
4. Verify only exact source matches are deleted

---

## Follow-up Issues

The following bugs and improvements were identified during QA and should be tracked separately:

| ID | Title | Severity | Repro |
|----|-------|----------|-------|
| BUG-001 | No graceful error when `~/.superlocalmemory/` directory is unwritable | High | `chmod 000 ~/.superlocalmemory && code .` (sets the directory to no permissions; restores with `chmod 755 ~/.superlocalmemory`) |
| BUG-002 | Dimension mismatch warning is not user-actionable — no button to trigger re-index | Medium | Switch OpenAI key, restart VS Code |
| BUG-003 | `syncStatus` command shows hardcoded TODO message instead of real status | Medium | Run "Memory: Sync Status" |
| BUG-004 | Auto-capture stores full file content (up to 1500 chars) on every save — no dedup guard between saves | Low | Save a file twice in quick succession |
| ENH-001 | `superlocalmemory.mode: "service"` is now the default; add explicit warning in docs when `plureslm-service` is missing | Enhancement | — |
| ENH-002 | Expose `IMemoryProvider` interface publicly so third-party extensions can contribute memory backends | Enhancement | — |
