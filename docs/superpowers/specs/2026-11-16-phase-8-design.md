# Phase 8: Full rollover (design)

Source: PLAN.md §8 (crowd modifiers), §11 Phase 8, §15.3 (bounded rollover), and the owner's Phase 8 brief. Starting point: 8a1e690.

## Pre-work
- **`devTools`** defaults to off; it is switched on for r/descent_game_dev only, in the app's subreddit settings.
- **Floor 0 flag on the server:** a per-user `tutorial` hash. It is set by `POST /api/start` with depth 0 (sent when Floor 0 ends) or by any real run start, and returned as `tutorial` with the floor. The run log stays in the browser; server-side resume goes to Later.

## Files
- `src/shared/crowd.ts` (new):
  - `modsFrom(tally)`: today's crowd becomes tomorrow's mods
  - `rolloverFloor(depth, seed, tally)`: the fallback ladder with the band check; the Lab and the server both use it
  - `trapHits(floor, log)`: which players' traps hurt or killed in a run, from its replay
  - the `Tally` type

  It is a new file because it is independent of generation and of the sim.
- `src/shared/gen.ts`:
  - `zoneWeights` works on shares
  - player traps carry their owner and are placed under a per-zone cap
  - the placed traps (tile, kind, owner, name) are written onto the floor
- `src/server/rollover.ts`: tally, then floor (ladder), post, summary comment, flair (200 per run plus a follow-up job), Chronicle record. A mod "Roll over now" (devTools) and "Post Floor 0".
- **Client:**
  - the yesterday line before the first move (deaths, deadliest zone, curse, your trap's results)
  - a trap death names its owner
  - the ghost card shows "set by u/name"
  - Lab tab "Rollover"

## Stored data
- **Floor JSON** gains:
  - `traps: [{ x, y, kind, owner, name }]`: every placed player trap
  - `yesterday: { depth, fell, cleared, zone, curse }`
  - `curses`, which already existed

  A replay reads only the floor, and a retune never changes a posted floor.
- **`f:{d}:mods`** is written by the rollover from the tally, before generation (set-if-absent, as in Phase 6).
- **`f:{d}:trapped`** hash: `{owner}:hurt` and `{owner}:killed` counts on the floor where the trap stands.
- **Run record** gains:
  - `name` (for flair)
  - `trapSouls { owner: n }` (what this run gave, so the reset tool can take it back)
- **Ghost record** gains `by` (the trap owner's name) when a player's trap killed it.
- **`f:{d}:flair`** hash: user → flair text, written on each accepted run and drained 200 per job.
- **`chronicle`** hash: depth → `{ depth, fell, cleared, curse, zone, killer }`, for Phase 9's screen.
- **`rolled`** hash: depth → 1. A floor is posted only once, whoever asks: the cron (which also claims its date in `rollovers`) or the dev tool (which does not, so the daily cron still runs).

## Decisions (continuing A1–A22)
- A23. **Shares, not counts.**
  - Fewer than `CROWD.minDeaths` (3) deaths in total: uniform weights.
  - Otherwise zones are ranked by deaths, but a zone under `CROWD.minShare` (5%) of the deaths counts as "other" (weight 0.8), not ranked.
  - Five deaths are visible; 1,000 rank the same way as 100.
- A24. **Top family:** kills by cause are mapped to families (darts to mechanisms; arrows to skeletons; trap and fall to none). The most kills wins if there are at least `CROWD.minKills` (3); ties go to `FAMILIES` order.
- A25. **Player traps:** at most `TRAP_MAX` (12) per floor and `TRAP_ZONE_MAX` (3) per zone.
  - Selection: a seeded shuffle by the new floor's seed, then taken in order, skipping zones already at their cap, until 12.
  - The rest add their overflow weight to their zone (PLAN §8).
  - A selected trap that finds no valid tile is dropped. The gates re-roll positions through retries.
- A26. **Ladder** (`rolloverFloor`), each step logged:
  0. full mods
  1. no traps
  2. no crowd modifiers (curse kept)
  3. plain floor

  A step is accepted when generation needs no fallback, gate 1 holds, and the band holds. Step 3 is always accepted.
- A27. **Band (no spiral):** the stored floor's skill-60 win rate on 16 bot seeds may fall at most 20 points below that day's plain floor.
  - On 8 floors × 16 seeds, the heaviest crowd (Deep Dark, 12 traps, all deaths in one zone) cost 33–43 points at depths 8, 14, 22 and 28.
  - Single floors vary from 0 to 100% for the blind bot, so an absolute band would reject good floors.
- A28. **Trap souls (A15):**
  - Awarded once, when the victim's run is first accepted: a resend returns the stored run and awards nothing.
  - +1 per hurt, +3 for the killing hit instead.
  - Never from your own trap; bots give and receive none; the reset tool takes them back.
- A29. **Flair:** each player's latest run, "Cleared floor N" or "Fell on floor N". At most 200 per run (`setUserFlairBatch` in 100s); the rest in a follow-up scheduled job.
- A30. **Summary comment** on the new post: how many fell and cleared on yesterday's floor, the deadliest zone, today's curse, how many traps were set.
- A31. **"Post Floor 0"** posts a practice post (`postData { depth: 0 }`), served as kind `practice`.

## Built and measured (Nov 16)
- **Reddit (playtest v0.0.1.142):**
  - Setup on Floor 4: `devTools` switched on for r/descent_game_dev; reset; seeded 20 bot ghosts; won; voted Frail; set spikes in the centre.
  - "Roll over now" logged: `ROLLOVER roll over now: floor 4 -> 5, ladder step "full", win 81% vs plain 88%, 1 player traps, curse frail, 413 ms`.
  - On Floor 5:
    - the summary comment was posted
    - the HUD reads "Floor 5, curse: Frail", and the yesterday line reads "Yesterday 40 fell on Floor 4, most in the west. Curse: Frail…"
    - the stored floor has my spikes at (8,9) with owner and name, and `myTrap` comes back to me
- **Heat on Floor 5:** the deadliest zone (the west) holds only a corridor there, so the weights moved hazards into the rooms nearest the weight. Hazards per zone, stored vs plain: centre 2 vs 0, east 2 vs 1, south-west 3 vs 2, south-east 0 vs 2.
- **28 bot-only days:** every floor solvable and inside the band, 5.4 s. The ladder stepped down three times (floors 11, 14, 27: heat made the floor 50+ points harder than plain).
- **Rollover with 1,000 runs:** 49 ms in the test harness. 200 flairs were set; 800 wait for the follow-up job.
- **Deviations:**
  - The HUD marks a cursed floor with a blood floor number and mark; the name is in the label and the yesterday line, because a text chip overflowed the 320 px HUD.
  - A trap whose zone has no valid tile moves to the nearest zone that has one, rather than being dropped.
