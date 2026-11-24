# Phase 11k: housekeeping and the front door (design and results)

Source: the owner's Phase 11k brief (Nov 20), after accepting Phase 11j and 0.0.3. No simulation or generator changes; one rollover change (A127), allowed by the owner later that day. Starting point: 40241ad (phase-11j).

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

- **A127. Nameless delvers shape tomorrow only as a fill-in (the one rollover change the owner allowed in 11k):**
  - `shapeOf()` in `crowd.ts`, shared by the server's tally and the local harness, reads a floor's ghosts.
  - From `CROWD.realDeaths` (5) real deaths, only real deaths decide tomorrow's zone weights and top killer.
  - Below that, the bots' deaths are added so the floor still has a shape (`filled`).
  - Curse votes and traps never pass through it; they stay players-only.
  - It works from the ghost records (each says whether it was a bot), so it needs no new storage and is right on floors written by 0.0.3. The old `heat` and `kills` counters had no reader left, so their writes (and the decrements in the bot purge and the dev reset) are gone; the tests now check the tally instead.
  - **What players see:**
    - `Floor.yesterday` now carries players only in `fell` and `cleared`, plus `nameless` and `filled`.
    - The intro reads "3 players and 12 nameless delvers fell on Floor 12…" ("0 cleared" is left out). When the bots filled in, it adds "Too few players, so the delvers filled in."
    - To keep the intro fitting at 360×640 with these words, "Today's danger gathered in the X" became "Today's danger: the X", and at 680 px tall or less the intro's lines use a 1.3 line height.
    - The summary comment counts players and nameless delvers apart, and says either "with too few players, their deaths helped shape today" or "enough players fell, so only players' deaths shaped today".
    - The Chronicle reads "N players fell (+M nameless delvers, who helped shape the next floor)".
  - A floor stored before 11k shows its old "N fell".
  - The README, the setting's help text and A70 (in the 11c spec) now describe this rule.

## Assumptions (recommended options taken)
- **Playwright as a dev dependency:** pinned to 1.65.1 (latest stable). It's tooling only, not a runtime dependency. CI installs its Chromium with `--with-deps`.
- **The runner imports `FLOOR_0` from `src/shared/content.ts` directly.** Node 24 strips the type-only import, so no build step or fixture file is needed.
- **`--budgets` reports, it doesn't gate:** throttled timings on a shared CI runner would flake. Sizes are already gated by `tests/bundle.test.ts`.
- **Nameless delvers:** the first draft of this phase only corrected the wording, since its brief ruled out rollover changes. The owner then allowed A127 as the one rollover change.
- **Dependabot:** the template's config opened 7 version-bump PRs. Versions are pinned until submission, so `open-pull-requests-limit: 0` for npm and GitHub Actions turns version updates off; security updates still open. The owner closes the 7 open ones.
- **Release:** the owner asked for 0.0.4 after tonight's rollover check, carrying the quiet-day wording and A127. Tonight's comment on 0.0.3 still uses the old wording.
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
- `bun run check` 172/172 (with A127's tests: the pure threshold test, the server's tally at and below the threshold, the 28-day test and both bands unchanged).
- `bun run e2e` 147/147, both with its own server and against a running harness.
- CI: see the report.

## Tonight's rollover on 0.0.3 (Nov 20, 15:00 UTC)
- `ROLLOVER cron 2026-11-20: floor 12 -> 13 (post t3_1y15mhz), ladder step "full", win 67% vs plain 19% (plain band check 33% after 5 rerolls)`, 3,451 ms.
  - 67% is the posted floor's 64-run win: inside Floor 13's plain band (35–75%) and A124's target (41–69%).
  - The redraw count isn't in the log (`Mods.draw` isn't printed), so it isn't known for tonight.
- Summary comment t1_19sxci8slvcg5, old wording: "Yesterday on Floor 12: 12 delvers fell, most in the west, and 2 cleared it. No curse today." The log says players 0 cleared / 0 fell, so all 14 were nameless delvers: the miscount A125 and A127 fix from 0.0.4.
- `NAMELESS floor 13: 12 bot ghosts from 21 runs`; flair 0 set; `SWEEP checked 1, purged 0`; errors 0, failed saves 0.
- "Your mark": none, correctly. No player cleared Floor 12, so nobody had a trap or vote to show.
- **Found:** the splash warmed `sprites.js`, which the build stopped emitting, so every warm logged a 404. It's gone from `WARM`, and `tests/bundle.test.ts` now checks that every warmed file is in the build.

## Release: 0.0.4
- Gate: `bun run check` 172/172 (an earlier run timed out while the machine slept; the rerun under `caffeinate` passed), lint clean, `bun run e2e` 147/147, ponytail review clean.
- `bun run deploy` uploaded 0.0.4; `devvit install r/descent_game_dev descent-game@0.0.4`; `devvit list installs` shows v0.0.4.
- Settings carried over: Nameless delvers 12, Dev tools on, the new help text.
- Floor 13 loads from the 0.0.4 web origin with no `sprites.js` 404. Its intro still reads "12 fell" because 0.0.3 stored that floor's yesterday. Tomorrow's Floor 14 is the first to carry the players-and-delvers counts.

## The players' subreddit moves to r/DescentDaily (Nov 24)
- The owner created r/DescentDaily, a public subreddit with a plain name, as the players' subreddit. 0.0.4 is installed there with `devvit install r/DescentDaily descent-game@0.0.4`, and the owner starts Floor 1 there from the menu.
- r/descent_game_dev stays private and becomes the playtest subreddit (`devvit.json` `dev.subreddit`), so r/descent_game_test isn't needed. It keeps its Floor 13 and Dev tools on.
- RELEASE.md, the README, the front-door kit, the Journeys request, the video shot list and the client's report-link fallback now name r/DescentDaily.
