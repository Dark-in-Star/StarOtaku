<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Anivio Web — Agent Guide

## What this is

A Next.js (App Router, TypeScript) client for browsing, searching, streaming, and tracking
anime/manga through the official MyAnimeList API v2. See `README.md` for the user-facing feature list,
screenshots, and tech-stack table — this file is for agents working *in* the codebase.

**There is no separate backend.** `src/lib/api.ts` and `src/lib/actions.ts` call
`https://api.myanimelist.net/v2` directly from server-only code. Do not reintroduce a proxy
server or add a public route handler that re-exposes these calls — see
`.claude/memory/mal-api-direct-integration.md` for why, and `.claude/memory/` in general for
deeper project-specific knowledge (architecture decisions, known gotchas, conventions) before
making structural changes.

## Commands

```bash
pnpm dev            # dev server on :3001
pnpm build           # production build
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint
pnpm test            # vitest unit tests (once)
pnpm test:e2e        # playwright e2e (builds + boots a mock MAL API)
```

Always run `typecheck` and `lint` on touched files before considering a change done. Unit
tests live next to source as `*.test.ts(x)`; e2e specs live in `e2e/`.

## Environment

Copy `.env.example` to `.env.local` and set `MAL_CLIENT_ID` (from a MAL app registration,
type "other"/PKCE). `MAL_API_BASE_URL` is optional — only set it to point at a local mock
(e2e does this automatically via `playwright.config.ts`).

## Conventions

- Package manager is `pnpm` (see `packageManager` in `package.json`) — don't use npm/yarn.
- UI is Tailwind CSS v4 + Radix UI primitives wrapped shadcn-style under `src/components/ui/`.
  Reuse an existing wrapper before adding a new Radix dependency.
- Design tokens (colors, radii) live in `src/app/globals.css` as CSS custom properties, themed
  via `[data-theme="dark"]`. Never add global CSS rules outside a Tailwind `@layer` — see
  `.claude/memory/css-cascade-layers-gotcha.md`.
- Server-only code (`src/lib/api.ts`, `src/lib/session.ts`, `src/lib/malAuth.ts`) is guarded
  with `import "server-only"`; Server Actions (`src/lib/actions.ts`, `src/lib/browseActions.ts`)
  use `"use server"`. Keep new MAL-calling code on one of these two sides — never in a Client
  Component or a public Route Handler.
- Modals that should be fullscreen on mobile / a centered dialog on desktop follow the
  `DialogContent` className recipe in `AnimeListEditModal.tsx` / `ListFilterModal.tsx` — reuse
  it rather than inventing a new responsive-modal pattern.
- Default to no comments; when one is warranted, explain *why*, not *what*.
