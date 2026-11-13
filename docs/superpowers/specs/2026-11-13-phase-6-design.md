# Phase 6: Server and first real playtest (design)

Source: PLAN.md §11 Phase 6, §15, the Phase 6 brief. Starting point d0dc6b6 (Phase 5 approved).

## Files
- `src/shared/api.ts`: wire types (`FloorResponse`, `RunRequest`, `RunResponse`, `RunResult`), the template counter types removed.
- `src/shared/sim.ts`: `score(state)` and `judge(floor, log)` next to `replay()`. `judge` validates and replays; the server and `local.ts` both call it.
- `src/server/game.ts`: Redis reads and writes: `openFloor(depth)`, `floorFor(user, depth)`, `submitRun(user, depth, log)`, `logStart(user, depth)`.
- `src/server/rollover.ts`: `rollover(date)` (cron) and `startFirstFloor()` (install trigger, mod menu).
- `src/server/routes/api.ts` (template file): `GET /api/floor`, `POST /api/run`, `POST /api/start`. Identity comes from `context` only.
- `src/server/index.ts`: one log line per request (§15.2).
- `src/client/local.ts` (LOCAL ONLY): the same endpoints on localStorage, plus `advanceDay()`.
- `src/client/net.ts`: `api()` (fetch in production, `local.ts` in dev) and the background submit with 3 retries. It is a new file because `game.ts` is near 240 lines of input and turn code and the network part is independent of it.
- `splash.html`/`splash.ts`: the minimal splash.
- `tests/server.test.ts`: `@devvit/test` server tests. `tests/bundle.test.ts`: builds once and asserts what each bundle contains.

## Redis keys
- `game` hash: `day` (today's depth), `postId` (today's post), `started`.
- `f:{d}:mods` string: `{ seed, curses, deaths, topFamily, traps }`. Phase 6 writes no curse, uniform deaths and no traps.
- `f:{d}:floor` string: the generated `Floor` JSON, written once with set-if-absent.
- `f:{d}:runs` hash: userId → `{ log, outcome, score, turns, torch, cause, tile, at }`. Written with `hSetNX`, so one accepted run per user.
- `f:{d}:scores` sorted set: userId → score.
- `f:{d}:starts` hash: userId → first start time (run-start log, §2).
- `rollovers` hash: UTC date → 1, claimed with `hSetNX` (a hash field returns whether it was set), so a second cron call on the same UTC day does nothing. `game.started` guards Floor 1 the same way.

## Flow
- **Floor:** generated on the server only, once, then stored. `GET /api/floor` reads the depth from the post's `postData`; it falls back to `game.day`. The response is one of:
  - `play`: floor and seed
  - `played`: the user's stored result
  - `closed`: the floor has rolled over; the response includes today's post URL
  - `login`: a logged-out viewer
  - `none`: no floor has been posted yet
- **Run:** the body is `{ depth, log }` and nothing else. `judge` rejects a log that:
  - uses a character outside `UDLRWI`
  - is longer than `RUN.maxActions`
  - contains a free action (a bump, or an item with nothing held, which changes no state)
  - does not end the run on its last action

  It then derives outcome, score, turns, torch left, cause and tile by replay on the stored floor.
  - A different log from a user who already has a run is rejected.
  - The identical log returns the stored result (a retry).
  - A depth below `game.day` is `closed`.
- **Rollover cron:** daily. The steps:
  1. take the date guard
  2. depth = day + 1
  3. write mods, then the floor (set-if-absent)
  4. submit the post with `postData { depth }`
  5. set `game`

  Generator fallback is logged with `console.error`.

## Client
- Saved logs are keyed `descent:log:{depth}:{seed}`. Resume replays them with animations skipped.
- Only actions that change state are logged and sent.
- **First visit:** Floor 0 first, then "Descend to Floor N". Floor 0 never calls the server.
- The end panel of a real floor shows "Saving", then "Saved" or "Not saved, retry". Its one action is "Practice Floor 0".
- **Designed states:** played (minimal result plate), closed (button: today's floor), logged out (button: log in), unreachable (button: retry), and no floor yet.

## Assumptions (take the recommended option)
- A1. **Score:** a win scores `1000 + 100·hearts + torch left`; a death scores turns survived (always under 1000). The numbers are in `content.ts` (`SCORE`).
- A2. **Seed** for depth d: `hash("descent:{subreddit}:{d}")`. It is stable per subreddit and needs no stored counter.
- A3. **Cron:** `0 15 * * *` (15:00 UTC, morning in the US). The date guard uses the UTC date.
- A4. **Floor 1:** started by the template's existing post creation (install trigger and the "Create a new post" mod menu, relabelled "Start Floor 1"). A second call while a floor is live only reports it. The template's example form and counter endpoints are removed.
- A5. **Logged out:** Devvit gives `userId: undefined` and `showLoginPrompt()`. The splash and game both show "Log in to descend", which opens the prompt. Floor 0 practice stays available in the game.
- A6. **Run cap:** `RUN.maxActions` = 1500. A floor's torch is at most a few hundred turns; oil adds 20; after the torch is out, dark damage ends the run within 6 turns.
- A7. **Splash data:** the depth comes from `postData` (no request needed). The played state comes from `GET /api/floor`.
- A8. **Execution:** done inline, not subagent-driven. Every task touches `api.ts`, `game.ts` or `sim.ts`, so the tasks aren't independent.

## Built and measured (Nov 13)
- **Reddit smoke test** (playtest v0.0.1.92, post 1xv86aq): splash, Descend, Floor 0, then Floor 1. A mid-run reload resumed at the same torch. The run ended Saved; the server log shows `POST /api/run d1 saved dead 44 31ms`; a second open shows the result plate.
- **Interactive on Reddit:** 3.5 s. game.js (372 KB gzipped) took 2.6 s on this link; the atlas is now preloaded in parallel. At 4× CPU on a local preview: splash 30 ms, game 335 ms.
- **Deviation:** `index.ts` stays a thin Hono app; routes live in the template's `routes/` files (§5 updated).
