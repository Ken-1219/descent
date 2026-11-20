# Phase 11k: housekeeping and the front door (design and results)

Source: the owner's Phase 11k brief (Nov 20), after accepting Phase 11j and 0.0.3. No simulation, generator or rollover-logic changes. Starting point: 40241ad (phase-11j).

## Decisions (continuing A1–A124)
- **A125. The summary comment counts real players, and a quiet day invites:**
  - The counts come from `realResult` (real players only).
  - Nameless delvers get their own sentence: "N nameless delvers (the game's own bots) fell there too: never on the boards, but where they fell shaped today's floor."
  - A day with no real run reads "Floor N is open. Be among the first down: where you fall, what you carve and the curse you vote shape Floor N+1." It never says "0 fell".
  - The heat (and so "most deaths were in …") still counts every death, as the tally does.
- **A126. The e2e runner lives in the repo:**
  - `tests/e2e.mjs` (`bun run e2e`) starts the local harness on :5190 through Vite's API, or reuses one already running.
  - It runs `tests/play.mcp.js` in Playwright's Chromium and exits 1 on any failed check or page error.
  - `--budgets` serves `dist/client` with a stand-in `/api` and measures §15.3 at 4× CPU throttle.
  - It is the one standalone browser script, an explicit exception the owner allowed on Nov 20. The README and the script's header say so.
  - CI has an `e2e` job.

## Assumptions (recommended options taken)
- **Playwright as a dev dependency:** pinned to 1.65.1 (latest stable). It's tooling only, not a runtime dependency. CI installs its Chromium with `--with-deps`.
- **The runner imports `FLOOR_0` from `src/shared/content.ts` directly.** Node 24 strips the type-only import, so no build step or fixture file is needed.
- **`--budgets` reports, it doesn't gate:** throttled timings on a shared CI runner would flake. Sizes are already gated by `tests/bundle.test.ts`.
- **Nameless delvers do shape tomorrow's floor.** Their deaths go into `heat` and `kills` (`submitRun` has no bot guard there), so the tally reads them. A70 ("excluded exactly as before"), the README and the setting's help text all said otherwise. Since this phase rules out rollover changes, the wording is corrected to the code and the behaviour is put to the owner as a question. The help text change ships with the next version.
- **The summary change also ships with the next version.** RELEASE.md says the players' subreddit updates only when the owner says so, so no 0.0.4 was cut. Tonight's comment on 0.0.3 still uses the old wording.
- **Front-door art:** drawn in a new Lab tab ("Front door", dev only) from the Delver and wisp sprites, the graded CC0 tiles the game uses, and the game's two fonts, in flat tokens. Exported with Playwright MCP element screenshots. Sizes: 256×256, 1920×384, 1600×480.

## Measurements: §15.3 on 0.0.3
| What | Budget | Measured | Where |
|---|---|---|---|
| Splash JavaScript | < 60 KB gzipped | 9.8 KB (9,816 B) | bundle test and `e2e --budgets` |
| Splash interactive, 4× CPU | < 1 s | 46 ms (median of 3) | `e2e --budgets`, production build |
| Game interactive, 4× CPU | < 3 s | 209 ms (median of 3; the intro, before Phaser) | `e2e --budgets` |
| Game total transfer | < 1.5 MB gzipped | 335 KB | `e2e --budgets` |
| Atlas | one PNG < 100 KB | 38.7 KB | `e2e --budgets` |
| Fonts | 2 woff2 < 60 KB | 2 files, 42.1 KB | `e2e --budgets` |
| Input to motion | < 50 ms | 4.0 ms | e2e |
| Animation lock | ≤ 120 ms | median 99, max 114 ms | e2e |
| Timed 18-move Floor 0 | < 60 s | 2.4 s | e2e |
| `generate(28)` | mean < 20 ms | mean 7.7, median 6.7, max 27.0 ms | gen test |
| `replay()` on the server | < 50 ms | 1.9 ms (best of 5); judge and store 4.2 ms | server test |
| `GET /api/floor` | < 50 KB | 8.6 KB with 1,000 ghosts; 9.5 KB played, with votes | server test |
| Rollover job | < 10 s | 448 simulated: mean 969 ms, max 5.3 s; real: see the rollover check | 11j script, server log |
| **On Reddit (Health, Floor 12)** | – | mweb first move p50 1.0 s, p90 2.8 s, 2 loads; intro p50 1.0 s, p90 2.3 s | Health menu |

**Health on Reddit:**
- The 0.0.3 load (12:34 IST, phone viewport) was cold, on the new web origin: 2,628 ms in all (script 1,787, floor 2,130, engine 2,576, intro 2,150). The 0.0.2 load the day before was 907 ms.
- No desktop or app loads yet: the desktop Playwright profile was locked by another session.
- Client errors 0, failed saves 0. Funnel: splash 1 > descend 1.
- Journey receipts on 0.0.3 still read `JOURNEY_RECEIPT_DENIED_PLAYTEST`.

**Checks:**
- `bun run check` 170/170.
- `bun run e2e` 147/147, both with its own server and against a running harness.
- CI: see the report.
