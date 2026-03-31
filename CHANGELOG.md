## [0.6.2] — 2026-03-31

- fix(lifecycle): v9.1 — fix QA dispatch (client_payload as JSON object) (3d6f74e)

## [0.6.1] — 2026-03-31

- fix(lifecycle): rewrite v9 — apply suggestions, merge, no nudges (43a2be3)
- chore: license BSL 1.1 (commercial product) (ccd4cb7)
- chore: standardize copilot-pr-lifecycle.yml to canonical version (22242f0)
- docs: add ROADMAP.md (081297b)
- chore: cleanup and housekeeping (0ea9d3b)
- chore: add standard CI workflow (46fe686)
- chore: enforce strict type-safety across org (ab6f106)
- chore: standardize lint-clean across org (e270d81)
- chore: apply org-standard automation files (#17) (95b373c)

## [0.6.0] — 2026-03-10

- feat: service-mode QA regression suite — IMemoryProvider abstraction + 112 automated tests (#16) (14be273)

## [0.5.0] — 2026-03-10

- feat: add MCP memory pack/bundle operations as VS Code commands (#15) (74bf3d9)

## [0.4.0] — 2026-03-10

- feat: service-first PluresLM architecture with MCP service client and legacy fallback (#14) (13269ba)
- ci: add PR lane event relay to centralized merge FSM (237af36)
- docs: fix legacy repository URL and audit README branding post-rename (#10) (8e6c6b6)
- docs: rename Superlocalmemory → PluresLM in README and package.json (#8) (d77102f)
- Add knowledge browser tree view panel (#6) (8746b0a)

## [0.2.1] — 2026-03-01

- fix(ci): add id-token permission to release workflow (#5) (c445f16)

## [0.2.0] — 2026-02-19

- feat: Zero-config embeddings with Transformers.js (#2) (64fc2c8)
- ci: add standardized release pipeline (d46c821)
- feat: VS Code extension with @memory Copilot Chat participant v0.1.0 (fd975b8)
- Initial commit (011f042)

# Changelog

## 0.1.0

- Initial release
- `@memory` chat participant for GitHub Copilot Chat
- Language model tools for Copilot agent mode (search/store)
- Sidebar views + status bar memory count
- Commands: store, search, forget, index, stats
