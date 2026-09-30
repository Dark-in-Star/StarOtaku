# Project Memory

Durable, project-specific knowledge for agents working in this repo — architecture decisions,
known gotchas, and conventions that aren't obvious from reading the code alone. Read the
relevant file before touching an area it covers. See `AGENTS.md` for commands/conventions and
`README.md` for the user-facing overview.

- [MAL API: direct integration](mal-api-direct-integration.md) — why there's no backend server, and the rules that keep it that way
- [CSS cascade layers gotcha](css-cascade-layers-gotcha.md) — never add unlayered rules to globals.css
- [Fixed-position + backdrop-filter gotcha](fixed-backdrop-filter-gotcha.md) — why full-screen overlays portal to document.body
- [Responsive modal pattern](responsive-modal-pattern.md) — the fullscreen-mobile/dialog-desktop recipe
- [Mobile navigation architecture](mobile-nav-architecture.md) — bottom nav, profile sheet, and the shared NAV_LINKS split
- [Testing setup](testing-setup.md) — Vitest + Playwright, the mock MAL server, and its parallel-worker caveat
- [Known e2e gaps](known-e2e-gaps.md) — specs referencing UI that's since been replaced
- [Link-prefetch GET mutation gotcha](link-prefetch-get-mutation-gotcha.md) — never wire a state-mutating route to `<Link href>`
- [Manga reader sources](manga-reader-sources.md) — how titles are matched per source, and the third-party quirks that were real bugs
