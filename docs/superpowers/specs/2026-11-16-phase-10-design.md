# Phase 10: The Warden and content completion (design)

Sources: PLAN.md §8 (position 7, the Warden row of the tier table), §7 (intro boss chain, boss-day splash), §11 Phase 10, §15, and the owner's Phase 10 brief. Starting point: 288c988.

PLAN's Phase 10 build list, and where each item lands:
- **The Warden arena:** A40–A41.
- **Stairs open from the start:** generated floors never lock the stairs, and the arena adds no door.
- **Each bump removes one link:** A41.
- **Deaths keep their damage:** a run's links count whether it clears or dies.
- **Shared HP of 12 × yesterday's players, minimum 10:** A42.
- **Killed: a memorial post with the top dealers:** A45.
- **Not killed: leftover HP carries to the next boss floor:** A44.
- **Final Floor 0:** a potion off the route teaches the item button. Everything else it teaches was already there.
- **All five curses:** all five were already built and applied (Short Wick, Overrun, Deep Dark, Light Sleepers, Frail).

## Files
- **`src/shared/content.ts`:** `WARDEN` (sight, reach, per-run cap, the pool rule, gap/cross/twice per tier, memorial size).
- **`src/shared/sim.ts`:**
  - `Kind` gains `warden`; `occupies()` and `wardenTier()`
  - `State.dealt`; `RunResult.dealt`
  - a `link` event
  - the Warden's wake, slam and bump rules
- **`src/shared/gen.ts`:** the arena on position-7 floors; gate 1 and the placement precheck treat the block as wall.
- **`src/shared/bot.ts`:** walks around the Warden, never fights it.
- **`src/server/boss.ts` (new):** the pool per cycle, its view, strike/unstrike, carry-over, the memorial, the rollover line. It is independent of the floor and run code.
- **`src/server/game.ts`:**
  - judges a Warden run on the living or fallen floor
  - strikes after an accepted run; the reset tool unstrikes
  - `floorFor` serves the boss view
- **`src/server/rollover.ts`:** opens the pool when a Warden floor is posted; reports the Warden's day in the summary comment, the ROLLOVER line and the Chronicle.
- **`src/server/boards.ts`:** the pulse carries the boss view.
- **Routes:** a scheduler job `memorial` (`devvit.json` task).
- **Client:**
  - the Warden drawn on its 2×2 block
  - the HUD chain slot (the key slot, which Warden floors never use)
  - the intro chain meter and the plate line, polled
  - the boss-day splash
  - local knobs `?floor=warden` and `?boss=alive|carried|killed`
  - Lab Screens entries

## Stored data
- **`boss:{c}` hash, `c = ⌊(depth − 1) / 7⌋`:**
  - `depth`, `pool`, `fresh`, `dealt`, `carried`
  - after a kill: `killer`, `killerName`, `killedAt`
  - `memorial`: the post id, or `pending` while posting
- **`boss:{c}:dmg` sorted set:** user → links (PLAN's damage sorted set).
- **Run record:** `dealt` (from `RunResult`), so the reset tool can take it back.
- **Wire:**
  - `RunResult.dealt`
  - `FloorResponse` play/played and `PulseResponse` gain `boss?: BossView { hp, pool, carried, killer, you }`
  - Chronicle rows gain `warden { hp, pool, killed }` on a Warden's day

  None of these conflict with PLAN, which names the hash and the sorted set.

## Decisions (continuing A1–A39)
- **A40. Arena:**
  - On a position-7 floor the stairs room is the arena: the farthest room at least 4×4.
  - The 2×2 block sits in its middle and the stairs on the arena corner farthest from the entrance. A corner lies outside every slam band.
  - The arena gets no family purchases.
  - The floor passes every gate. Gate 1's route treats the block as wall, gate 3's bot walks around it, and both difficulty bands apply as on any floor; the plain floor at that depth has the arena too.
- **A41. The Warden in a run:**
  - **Movement and harm:** chained; it never moves and never dies in a run. Darts, arrows and bombs don't harm it.
  - **Waking:** within 5 steps of its block with line of sight.
  - **Slams:**
    - A slam is marked one turn ahead on a 2-wide band running out of the block for 4 tiles, stopped by walls.
    - It slams the rows' band when you are more beside it, the columns' band when you are more above or below it.
    - Each slam does 1 heart, cause `warden`.
  - **Tiers:**
    - T1: one band, 3 quiet turns between slams
    - T2: 2 quiet turns
    - T3: both bands (a cross)
    - T4: a cross, then a second one marked the next turn
  - **Dodging:** from any tile beside the block, one step to a corner dodges every pattern.
  - **Bumps:**
    - Each bump breaks one link: +1 `dealt`, at most `WARDEN.perRun` (30) per run.
    - Past that, a bump is a wall: no turn passes, so it is never logged.
    - A bump burns no torch, so fighting costs dodges, not light.
  - **Why no torch bonus:** a torch bonus made Warden floors easier for walkers (depth 14 rose from 54% to 78%) and broke the curve. With free bumps the curve passes its bands: list A 76/66/50/43, list B 82/61/51/45.
  - **Score:** unchanged; links are reported beside it.
- **A42. Pool:**
  - **Rule:** `12 × max(5, real players on yesterday's floor)`. Real players means bots excluded (`f:{d}:real`). It is opened when the Warden's floor is posted.
  - **Changed from PLAN's minimum of 10 at the owner's request:** the floor of the pool is now 60 links.
  - **Measured:** a scripted committed player (bump, dodge, leave while the torch covers the walk out) breaks 10–30 links, mostly 11–27, at T1–T3. It breaks fewer at T4.
  - **Five players:** 12 links each clears the 60-link pool.
  - **A thousand players:** the pool is 12,000. At 30 links a run, ending it within an hour needs at least 400 of them playing in that hour.
- **A43. Damage and the kill:**
  - **Source:** damage is `RunResult.dealt` from the server's replay of an accepted run. A resend returns the stored run and adds nothing. Bots never strike. The reset tool subtracts the run's links from the pool and the sorted set.
  - **Atomicity:** `dealt` moves only by one atomic `hIncrBy` per run. HP is derived as `max(0, pool − dealt)`, so it can never be stored below zero.
  - **The kill:** made by the run whose increment crosses the pool (`total − dealt < pool ≤ total`), claimed with `hSetNX(killer)`. Two killing blows at once make exactly one kill.
  - **After a reset:** a kill stands even if a reset later lowers `dealt`.
- **A44. Carry-over (the first state to outlive a day):**
  - **Rule:** an unbeaten Warden's next floor (7 days later) starts with `min(leftover, fresh pool)`; a kill resets it to fresh.
  - **Bounded:** it is never more than a fresh pool, and while unbeaten it can only fall from one boss floor to the next.
  - **Small crowds:** a day with 2 or 3 players still wins in the end. Their links stay off the chain, so the next Warden floor starts lower, and so on until it falls.
- **A45. Memorial:**
  - **Where it runs:** a scheduled job, started when the kill is made. The rollover asks again if a memorial is missing, so a failure never blocks a run or the rollover.
  - **Exactly once:** the job claims `memorial` with `hSetNX` before posting. A failed post releases the claim so the next ask retries.
  - **Content:** the killing blow and the top 5 dealers.
- **A46. Killed mid-day:**
  - **What later players get:** the same rows with the block removed (an empty arena, the stairs open). The intro and splash say who killed it.
  - **Judging:** a run is judged on the floor being served, then on the other one. A run begun just before the kill still counts, and a log that fits neither is rejected.
- **A48. Links per run (tuning `perPlayer`):**
  - On a Warden's day the ROLLOVER line and the Chronicle record carry, next to the pool: runs (real players), runs that broke a link, all links, and the mean, median and most per run.
  - The mean includes runs that broke none, because the pool is sized per player.
  - The work is a few reads: one count and two rank lookups in the damage set.
  - A reset to zero takes a player out of the set, so its size stays the number of runs that broke a link.
- **A47. Live HP:** it rides the existing visible-only 20 s pulse; no realtime. During a run the HUD counts down from the HP when the run began, less your own links.

## Built and measured (Nov 16)
- **Tests:** `bun run check` 134/134 (14 in `tests/warden.test.ts`); e2e 102/102 (sections 16–17 cover the arena, bumps, the HUD chain and the alive/carried/killed plates); layouts checked from 320×320 to 1280×800.
- **Generation:** a Warden floor takes a median of 2–5 ms, at most 25 ms at depth 28 (24 of 50 candidates rejected there).
- **Curve with the Warden:** list A 76/66/50/43, list B 82/61/51/45, inside both bands.
- **Links per run:** the scripted fighter breaks 10–30, mostly 11–27.
- **Reddit smoke test (r/descent_game_dev):**
  - **Floor 5 → 6 ("Roll over now"):** Floor 6 carried deaths `[2,13,0,5,0,0,0,0,0]`, killer dark, curse Overrun and the owner's spikes. Its intro's ☠ and ▲ counts match the stored floor and a hand count. Log: 775 ms.
  - **Floor 6 → 7 (the 15:00 UTC cron):** `WARDEN floor 7: pool 60 (fresh 60 from 1 players)`; the ROLLOVER line carries `Warden pool 60; floor 6 predicted 100%, players 1 cleared / 0 fell (100%)`; 764 ms. The owner's trap is on Floor 7.
  - **Fight:** a 10-link run logged `saved won 1223, 10 links`; the pulse gave `Warden 50/60` in 13 ms; the reset tool put the pool back to 60/60.
  - **Kill and memorial (Nov 17, follow-up):** the dev tool set 5/60 (`SET LINKS … 5/60`). A real 10-link run logged `WARDEN killed on floor 7 by Clean_Position8332: 65/60`, then exactly one post, `t3_1xybzhz` "The Warden has fallen (Floor 7)", with the killer and the top dealers. A later visit got the fallen floor (no W, "Its arena is quiet"). The Floor 8 summary comment says "The Warden fell to u/Clean_Position8332." and the Chronicle row carries `warden {killed: true}`.
- **A50. Dev tool "Set the Warden's links":** behind devTools and logged. It clamps to 1..pool, so a real run makes the kill. It credits nobody; `forced` keeps its share out of the links-per-run stats.
- **A51. Fixes from the kill test:** a fallen Warden always shows 0 HP (a reset after the kill had shown leftover links); the plate shows "You broke N links" once, only when N > 0.
- **A52. Shared line (owner):** a torch event takes the line under the HUD on the turn it happens (crossing 20%, reaching zero); on every other turn a nearby carving wins.
- **A49. Low torch (from the owner's playtest):** at `TORCH_LOW_PCT` or below, the line under the HUD says "Torch low: N turns of light left" (or "Torch out" at zero), and the whole wick turns ember. A nearby carving takes the line first.
