# pluresLM VS Code Roadmap

## Role in Plures Ecosystem
pluresLM‑vscode brings persistent memory to Copilot Chat in VS Code. It provides a chat participant, sidebar, and tool integration backed by the pluresLM service.

## Current State
Service‑first mode is the default with legacy SQLite fallback. The extension exposes commands, chat participant, tool registrations, memory packs/bundles, and a sidebar. Gaps are around service reliability, sidebar UX polish, search quality, and marketplace readiness.

## Milestones

### Near-term (Q2 2026)
- Improve service connection lifecycle (startup checks, retries, clearer errors).
- Finish sidebar UX (empty states, grouping, search filters, perf).
- Refine auto‑capture and recall heuristics for Copilot agent mode.
- Update docs/screenshots for release readiness.

### Mid-term (Q3-Q4 2026)
- Memory search quality improvements (ranking, highlighting, context preview).
- Full deprecation of legacy tool aliases with migration guidance.
- Telemetry hooks for opt‑in quality metrics and failure diagnostics.
- Marketplace polish: branding, changelog cadence, onboarding walkthrough.

### Long-term
- Multi‑workspace memory scoping and profiles.
- Shared memory packs with team sync workflows.
- Deep integration with pluresLM‑mcp advanced queries and graphs.
