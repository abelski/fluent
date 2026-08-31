# Full Playwright suite: known pre-existing flakiness (found while validating plan #16)

Running the entire suite in one shot (`npx playwright test --reporter=list`, no `--workers`
override) on this dev machine (10 CPUs) produces a different set of ~15-30 failures on each run,
concentrated in tests that have nothing in common with whatever was just changed. Two independent
full/targeted runs during plan #16's validation produced non-overlapping failure sets (32 tests,
then 17 tests, from the same working tree) — a clear non-determinism signature, not a real
regression. Root causes identified so far:

1. **Resource contention under default parallelism.** A spec that runs in 1.7-2.1s in isolation
   was logged as a 15.2-minute "slow test file" in the full run. The machine is running two dev
   servers (`uvicorn`, `next dev`) plus N parallel Chromium workers plus, for grammar-content
   specs, real requests to the Neon database — under full load some tests simply time out waiting
   on a queued browser/network resource. Re-running the same failing test file alone (or the same
   set with fewer concurrent files) reliably passes.
2. **A pre-existing `localhost:8000` vs `localhost:3000` mismatch on redirect assertions.**
   `playwright.config.ts` defaults `baseURL` to `http://localhost:8000` (the backend, which
   proxies to the Next dev server in `DEV=true` mode per this repo's architecture). Several tests
   that assert an unauthenticated redirect lands back on `localhost:8000` (`seo-public-pages.spec.ts`,
   `user-settings.spec.ts`, `auth.spec.ts`, `custom-programs.spec.ts`) instead observed the browser
   at `localhost:3000` — i.e. the dev-mode proxy is not always transparent; under some conditions
   the redirect resolves against the upstream Next server's own port instead of being rewritten
   back through the backend's port. Not investigated further (out of scope for a
   frontend-presentation plan) — worth a dedicated look if these redirect assertions keep flaking.

**Practical takeaway:** don't trust a single full-suite run as a pass/fail signal for an unrelated
change. If it reports failures, check whether they're isolated to files you touched (re-run just
those) before assuming a regression — a clean isolated re-run of the same failing tests is strong
evidence the failure was environmental. This is what plan #16 relied on to confirm no regression
despite the full suite reporting failures on both of its full-suite attempts.
