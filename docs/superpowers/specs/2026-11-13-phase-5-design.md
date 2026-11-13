# Phase 5: Generator and difficulty (design)

Source: PLAN.md §8 and §11 Phase 5, the Phase 4 rule decisions (§8, binding), and the user's Phase 5 brief. The tuning numbers live in the `content.ts` Phase 5 block.

## Files
- `src/shared/gen.ts` provides:
  - `tiersFor(depth)` and `isWardenFloor(depth)` (the Phase 10 hook)
  - `showcaseFamilies(depth)`
  - `generate(depth, seed, mods)`, which returns floor, rooms, rejected count and safe path
  - `safePath(floor)` (gate 1) and `strandFree(floor)`
- `src/shared/bot.ts` holds `bot(floor, skillPct, seed)`. It is a new file because `sim.ts` is already past 600 lines and the bot only uses sim's public API.
- `tests/gen.test.ts` covers tiers, determinism, the 2,000-floor gate run, timing and the curve. It is a separate file so Vitest runs it in parallel with `shared.test.ts` and `check` stays under 60 s.

## Tiers
- For band `b` and position `p`: tier = `min(4, b + (p ≥ familyPos ? 1 : 0))`. Tier 0 means the family is absent and is omitted from `Floor.tiers`.
- Position 7 has no family until the Warden (Phase 10). `isWardenFloor()` is the marked hook; for now the floor generates as an ordinary one.
- **Showcase rule (decision):**
  - The showcase room holds the families that arrive or rise on this floor.
  - On floors with nothing new (position 7, and every floor from depth 29 on), the showcase rotates through the families: `FAMILIES[(depth − 1) mod 7]`.

## Generator, in order
1. **Seed:** `mulberry32(hash("descent:depth:seed"))`.
2. **Rooms:** the side length and room count come from §8. BSP splits the largest leaf until the room count is reached; each leaf holds one room. Prim joins the rooms with L-shaped corridors, plus `ROOMS.loops` extra corridors, so every floor has a loop.
3. **Entrance and stairs:** the entrance is in room 1, a random room. The stairs go in the room whose centre is farthest from the entrance by BFS. Room 1 is never the stairs room.
4. **Room roles:** rooms are sorted by distance from the entrance:
   - room 1 is safe
   - the nearest other room is the showcase, holding only the new families
   - each later room allows the new families plus one older family, assigned in a cycle
5. **Crowd:**
   - Compass zones split the grid into 3×3. They are ranked by yesterday's deaths and weighted 2.2 / 1.6 / 1.2, then 0.8, with 0.6 for zones with no deaths (stored ×10). If no zone has deaths, the weights are uniform.
   - Yesterday's top-killing family gets 1.5× purchase weight.
   - Player traps are shuffled with the seed. The first 12 are placed; the rest add weight to their zone.
6. **Budget:** `8 + 3·min(depth, 35)`, multiplied by the curses' `budgetPct`.
   - Each new family is bought once in the showcase room first.
   - Then purchases are drawn by family weight. Each must fit the remaining budget and the family's 40% cap. The room is drawn by its zone weight among the rooms that allow the family.
   - It stops when nothing fits or placement keeps failing.
7. **Placement constraints:**
   - Nothing goes in room 1.
   - No hazard within 2 tiles of the entrance.
   - Every enemy and den is at least 5 tiles (Manhattan) from every room-1 tile. That covers goblin sight 4, T1 imps waking through walls at 4, and skeleton sight 4.
   - Gates go only on doorways whose closure keeps the stairs reachable.
8. **Items:** `1 + floor(band / 2)`, at most 3. The kind is drawn by weight (potion 3, oil 2, bomb 1), placed in rooms other than room 1.
9. **Player traps** are placed on the finished layout, in their zone (they're the last thing added).
10. **Torch and gates** are computed on the finished floor, with crowd weights and traps already applied.

## Gate 1: the zero-damage path
Gate 1 is a Dijkstra search over (x, y, turn mod spike period). The actions are the four moves plus Wait; the cost is torch burned. Enemies are ignored (§8).

How each hazard is modelled. Nothing is modelled more kindly than the sim:

| Hazard | Model |
|---|---|
| Fixed spikes (T1), revealed buried spikes, `x` Trapsetter spikes | blocked |
| Breathing / wave spikes (T2/T3) | time-tracked: a tile is safe at turn t only if its stage at t is not "up" |
| Buried spikes `u` (T4), hidden pits `o`, false stairs `F` | always dangerous: blocked |
| Open pits `O` | blocked |
| Crumbling floor and chains `,` `;` | blocked |
| Plates `_` | blocked (never trigger a mechanism) |
| Gates `H`/`h`, slamming and timed doors | blocked; a mechanism is never required |
| Plate dart lines and Trapsetter slit lines | blocked, every tile of the line |
| Dark rooms | passable; burn `DARK.burn` per turn spent inside (2 at T2+); braziers assumed unlit |
| Dens | passable (stepping on one destroys it) |

- **Verification:** the found path is replayed in the real sim on the floor with enemies and dens removed. It must take no damage and reach the stairs. This catches any gap between the model and the sim.
- **Torch** is measured in turns burned: waits count, dark rooms burn 2, free bumps burn nothing.

## Other gates
- **Gate 2:** the path's burn is at most 70% of the torch.
  - **Deviation:** the torch is `ceil(safeBurn × slack)`, not shortest path × slack. Gate 2 then always holds (slack ≥ 1.5 means at most 67%), and it stays as a check.
  - Curses can shorten the torch, but never below gate 2.
- **No stranding:** with every gate closed, every tile reachable from the entrance can still reach the stairs.
- **Gate 3:** `bot(skill 100)` wins with at least 1 heart.
- **Retries:** a failing floor is retried with seed + 1, at most `RETRY_CAP` times. Hitting the cap throws, which fails the test. Rejections are counted.

## Bot
- **What it reads:** only what a player can:
  - `visibility()` and the tiles it has seen
  - `tells()`
  - hidden hazards learned from their tells (remembered once seen)
  - the stage of a visible spike (its pattern is readable)
- **Each turn, it takes the first of these that applies:**
  1. Attack an adjacent enemy, or step off a tile that is marked (several wind-ups, a line, rising spikes, a cracking chain).
  2. Use an item: a potion at 1 heart; oil at 25% torch or less; a bomb when 2 or more enemies are adjacent.
  3. Step along a Dijkstra plan to the known stairs, or explore. Exploration goes to the unknown tile that minimises 2·cost − (distance from the entrance).
- **Waiting:** it waits when the next tile would hurt next turn.
- **Skill:** with probability `skill` it takes that step; otherwise it steps greedily toward its target, ignoring hazards and tells (§8).
- **Curve:**
  - Skill 60. The tuning list is seeds 1–50; the untouched report list is seeds 1001–1050. Tuning goes through `content.ts` only.
  - Targets: about 80% at depth 1, falling to about 35% at depth 28, never under 25%, and never rising more than 10 points between depths except after a boss floor.

## Curses
`CURSES` in `content.ts` holds two: `short-wick` (torch 80%) and `crowded` (budget 125%). `Mods.curses` lists the active ones. The other three are a question in the report.

## Look
- Decoration never uses cracks, blood corners or red plates.
- The client's `floor-chip` decoration is removed: its dark squiggles resemble cracks. Generated floors use plain floor plus wall torches.

## Client
- `game.html?depth=15&seed=123` opens a generated floor in dev builds, through a dynamic import as for `?scene`. Production never ships the generator or the bot.
- **Lab Depth tab:**
  - a slider (1–60) with a large floor and its hazard census
  - six comparison floors at depths 1, 4, 8, 15, 22 and 28, in two rows of three at 1×
  - a 3×3 compass to paint deaths, which regenerates every floor
  - the win-rate chart, measured in the browser in chunks on seed list A

## Decisions made while building (all numbers in `content.ts`)
- D1. **Slack covers exploration.** Slack is 300%, +15% per room beyond 4, with no decline by depth; §8 had 230% falling to 150%. The gate-3 bot is a first-visit player, and exploring cost it 1.7–2.7× the safe path at the median and up to about 4× at the 75th percentile. With §8's numbers most seeds were rejected. Difficulty now rises through density, budget and tiers, not torch. This is a deviation from §8.
- D2. **Budget** is `8 + 4·min(depth, 35)` (§8: 3 per depth). The family cap is 30% (§8 allows up to 40%), so a showcase family can't flood a floor.
- D3. **Room capacity:** one instance per `TILES_PER_INSTANCE[band]` tiles (10, 8, 6, 5, 5, 5), scaled by the room's crowd zone weight, so painted deaths move hazards and don't just reorder them.
- D4. **Skeletons:** purchase weight 2 and at most 1 instance per floor. Piles block movement (rule 6), so several skeletons wall off corridors for good and the gate-3 bot gets stuck; see the report question.
- D5. **Older families** are shuffled by seed before one is assigned to each later room, so every family turns up across floors even when there are fewer rooms than families.
- D6. **A hazard placement that would cut the only safe route is taken back**, using a cheap static precheck while placing.
- D7. **Decoration:** the `floor-chip` and `floor-crack` decoration is gone, so cracks only mean danger.
- D8. **Bot behaviours a player would also use:**
  - remember dark tiles; light an adjacent brazier
  - plan around timed spikes
  - charge divers (they stay dead) and walk past archers (they rebuild)
  - wait out bone piles from a spot out of their line
  - jump into a seen pit to escape when cornered (rule 7: 1 heart, lands nearer the stairs)
  - break dithering loops with bold, seeded random steps

## Follow-ups after the gate (user answers, Nov 13)
- F1. **Walkable piles** (rule 6 amended): a pile is floor for everyone; at 0 it rises once its tile is empty; no bump reset. The one-skeleton cap is removed, and the bot's pile-luring logic with it.
- F2. **Gate 3 plays with the map:** fog off, hidden hazards known, the same shunned tiles as gate 1, enemies read by their tells. The curve bot stays blind. Both bots fight through an enemy in the way rather than wait behind it.
- F3. **Costs from lethality:** hearts lost per 100 instances by the skill-60 bot, two passes, clamped 1–8 (table in content.ts). Divers (T2 imps) cost 6; harmless upgrades (gates, dark rooms) cost 1.
- F4. **Slack** is back to a difficulty knob: `max(160%, 250% − 2%·depth)`, with no room bonus (supersedes D1). Exploration is now the blind player's problem, as it should be.
- F5. **Curses:** five, as data. Win-rate costs are −4 to −9 (table in PLAN §8). Every curse passes the gates.
- F6. **Divers:** 79 of 99 diver hits on the map bot came with no escape tile. A diver lined up along a corridor marks up to 6 tiles and you can move one, so the depth-9 dip is the diver rule in corridors more than the bot. The costs now limit how many divers a floor gets.
