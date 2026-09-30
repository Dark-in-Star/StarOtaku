# Known e2e gaps

As of the mobile-nav redesign and the Browse/Search merge, a few specs in `e2e/` still assert
the *old* behavior and fail. Left for the maintainer to fix manually; noted here so they aren't
mistaken for new regressions:

- **`e2e/search.spec.ts`** (all 4 tests) — navigates to `/search?q=...` and expects a
  `results for` heading + a "manga" tab link on that page. `/search` was merged into `/browse`
  (see `mobile-nav-architecture.md`); these tests need rewriting against `/browse?q=...`.
- **`e2e/responsive-nav.spec.ts`** — "mobile viewport hides inline nav links behind a hamburger
  toggle" expects a `Toggle menu` button. The hamburger was replaced by `BottomNav.tsx` +
  `MobileProfileSheet.tsx`; this test needs rewriting (or replacing) against the new mobile nav.
- **`e2e/manga.spec.ts`** — "ranking dropdown switches the active ranking type" expects a
  `Manga Rankings` heading that no longer exists anywhere in `src/` since the Browse rework.
- **`e2e/mylist.spec.ts`** / **`e2e/anime.spec.ts`** — a handful of edit-modal / status-tab tests
  are flaky specifically on mobile/tablet viewports, independent of the shared-mock-state race
  in `testing-setup.md`. Root cause not yet diagnosed — worth investigating with
  `--workers=1 --project=mobile` in isolation before assuming it's the same known caveat.

Don't "fix" these by reverting the UI changes that made them fail — the specs are stale, not the
app.
