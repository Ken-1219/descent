# Phase 7a: Ghosts and carvings (design)

Source: PLAN.md §7 (Ghosts and carvings), §11 Phase 7a, and the owner's Phase 7 brief with the Nov 16 decisions. Starting point: 4b15dba.

## Files
- `src/shared/content.ts` holds:
  - `CARVINGS`: 12 phrases with stable ids and a kind (`warning`, `path`, `treasure`)
  - `GHOSTS`: the listing cap and the seeding limits
  - `FLOOR_0_GHOSTS`
- `src/shared/ghosts.ts` holds:
  - the ghost record and view types
  - `carvingOf`, which parses and validates a carving
  - `ghostView`: per-tile counts plus the capped list, carved first, then newest
  - `fixtureGhosts` for the Lab and local mode

  Server, local.ts and tests all use it. It is a new file because it is independent of the sim; ghosts never enter it.
- `src/server/game.ts` changes:
  - the death write: ghost, heat and kills in one transaction after the run's `hSetNX`
  - `carve`, `seedBots`, `purgeBots`, `avatar`
  - the ghost view in `floorFor`
- Routes:
  - `POST /api/carving`
  - `GET /api/avatar?name=` (a snoovatar URL, fetched only when a card opens)
  - menu items "Seed bot ghosts" (a form asks for N) and "Purge bot ghosts"
- Client:
  - `scene.ts`: wisps, glyphs and count plates, a carving preview, a camera lift while a panel covers the map, and tile hit-testing for taps
  - `ui.ts`: carving picker, carving line, ghost card
  - `game.ts`: wiring
  - `art.ts`: glyphs and a 3×5 digit font

## Redis keys (7a)
- `f:{d}:ghosts` hash: user → `{ name | null, x, y, cause, at, bot? }`. Bots use keys `bot:{n}` and `name: null`.
- `f:{d}:carvings` hash: user → `"id"` or `"id:dir"`, written with `hSetNX`, so a carving is final.
- `f:{d}:heat` hash: compass zone 0–8 (`zoneOf`, 3×3) → deaths.
- `f:{d}:kills` hash: cause → deaths.

These are recorded only; nothing reads heat or kills until 7b.

## Rules
- **Death write:** a ghost is written only after the run is accepted by `hSetNX`. The tile and cause come from `judge`; the name comes from `context.username`.
  - One transaction writes the ghost, heat, kills and the score.
  - Bot runs go through `submitRun` like real ones, flagged `bot: true` on both the run and the ghost.
- **Carving:** accepted only if all of these hold:
  - the floor is live; a rolled-over floor returns `closed`
  - the caller has a ghost on it; a survivor has no ghost and is rejected
  - the id is in `CARVINGS`
  - a path phrase has a direction, and only path phrases have one

  The same carving again returns the stored one; a different one is rejected.
- **Ghost listing:** per-tile counts for every tile, plus at most `GHOSTS.list` records: carved first, then newest. The caller's own ghost is always included.
- **Purge:** removes every `bot:*` entry from runs, scores, ghosts and carvings, and subtracts their heat and kills.

## Client
- **Wisps:** drawn only on tiles lit right now (torch radius):
  - 1 ghost: one wisp
  - 2–4 ghosts: two wisps
  - 5 or more: a cluster of three wisps and a count plate

  Your own ghost has an ember outline. At most 60 wisps are drawn on screen.
- **Glyphs:** in `wisp` colour, in the tile's bottom-left corner:
  - ▲ for a warning
  - an arrow for a path, pointing the player's chosen direction
  - ◆ for treasure

  A glyph shows what the phrase claims, never whether it is true. No player-facing word says "bait".
- **Carving line:** standing on or next to (8-neighbour) a carved ghost shows a line under the HUD with `aria-live`: name, phrase, arrow. A "Read" button in the line opens the card, so keyboard and one-handed players can open it too.
- **Ghost card:** opened by tapping a wisp, or by "Read". It shows:
  - the snoovatar at 96 px, loaded only when the card opens, with the wisp as the fallback image
  - u/name, or "a nameless delver"
  - the carving and the cause
  - an empty row reserved for 7b's record and votes

  Close with the button or Esc. Reading a ghost is never an action and never logged.
- **Picker:** one native `<select>`; each path phrase appears once per direction. It sits on the death panel and on the result plate while the floor is live and the ghost has no carving.
  - Carve is primary; Skip is secondary.
  - While picking, the scene previews the glyph on the death tile and lifts the camera so that tile and its neighbours stay visible above the panel (checked at 320×320).
  - It uses the same Saving, Saved and Not saved states as the run. A carving made before the run is saved waits for the run, then sends.
- **Fetching:** ghosts are fetched with the floor, and again on the result screen. The splash and the played plate show "N fell".
- **Floor 0** has scripted ghosts (`FLOOR_0_GHOSTS`) drawn by the same renderer and card.
- **Dev tooling:**
  - local mode: `?ghosts=0|1|20|300|1000` adds fixture ghosts to the floor
  - Lab tab "Ghosts" frames the game with each fixture

## Assumptions (continuing A1–A8)
- A9. **Carvings (12):**
  - warnings: Trap ahead, Turn back, Dead end, Something waits here, Trust no ghost, Save your torch
  - paths: Safe this way, Stairs this way, Shortcut this way
  - treasure: Treasure nearby, Worth the risk, Something useful here

  Kinds are internal; the player sees only the glyph shape.
- A10. **Heat zone:** `zoneOf` (3×3) of the death tile, on the stored floor's grid.
- A11. **Listing cap:** `GHOSTS.list` = 60 records, matching "at most 60 wisps on screen". Tile counts cover every tile; a grid has at most 441 tiles.
- A12. **Bot seeding:** a form asks for N ghosts, up to 100 (`GHOSTS.seedMax`). Each bot run is several Redis calls; 20 ghosts took 1.2–1.3 s on Reddit, so 100 stays well inside the 30 s request limit. 300 would not.
  - The skill-60 bot plays seeds until N deaths, at most 6·N runs. Survivors' runs are stored too, as runs without ghosts.
  - Bot ghosts may be carved with a random phrase, so a seeded floor shows carvings.
- A13. **Snoovatar:** `reddit.getSnoovatarUrl(username)` on the server. The webview loads the returned URL directly; if the frame blocks it, the card keeps the wisp fallback (checked on Reddit).
- A14. **Picker layout:** one `<select>` with direction-specific options rather than separate arrow buttons. That keeps the death panel short enough at 320×320.

## Built and measured (Nov 16)
- **Reddit (playtest v0.0.1.108):**
  - the cron had already posted Floors 2–4 unattended at 15:00 UTC
  - seeding 20 bot ghosts on Floor 4 took 21 runs and 1.3 s; purge removed 21 bot runs; re-seeding took 1.2 s
  - the splash reads "20 fell"
  - Floor 0's ghost line and card work in the frame
  - `/api/carving` rejects "no death", a bad id, and a closed floor, each with its log line
  - snoovatar: `getSnoovatarUrl` returns an `i.redd.it` URL and the webview loads it (380×496, shown whole)
- **Not done on Reddit:** play, die and carve. This account had already played the live floor (and its Floor 3 and 4 runs predate 7a, so they have no ghost). The owner's checklist covers it after the next rollover.
- **Floor response with 1,000 ghosts:** 5.7 KB, 2.7 ms on the server.
- **Deviation:** the ghost glow is a faint per-tile radial (0.75 tile, 20% alpha), not part of the torch's light cut. In the shared light cut, 300 ghosts washed the room green and hid the hero.
