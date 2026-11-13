# Phase 4: Tiered obstacles and enemies (design)

Source: PLAN.md §8 tier table, §6/§7 tells, §15.4 animation, and the user's Phase 4 brief. The Warden row is Phase 10. No generator, budget spending, bot or curses yet.

## Approaches considered

1. **Tier on the floor, rules in one `step()`** (chosen). `Floor.tiers` gives each family one tier for the whole floor, which matches §8: a family on a floor is at tier `b` or `b + 1`. Map characters say *what* stands on a tile; the tier table in `content.ts` says *how* it behaves. Changing a tier's difficulty means editing `content.ts` only.
2. Tier per map character (`^1`…`^4`). This needs two characters per tile or 28 glyphs. Rejected.
3. One class per family with an `act()` method. That is a wrapper class per family, which CLAUDE.md bans, and it hides the fixed turn order. Rejected.

For rendering, the Lab cannot run 34 Phaser games (WebGL context limit), so the Bestiary draws scenes on 2D canvases. To stop the two renderers drifting apart, the pure parts move into `sprites.ts` and both renderers use them:
- `look()`: which frame each tile, enemy and tell uses
- `choreograph()`: the per-turn motion keys

## Data (`src/shared/content.ts`)

- Each family has a `Record<Tier, …>` table of its numbers. Every entry also carries `cost` (§8: 1, 2, 3, 5, plus 1 for enemies) and `frames` (the pack or own sprite names it draws). A test checks that every frame name exists.
- `SPIKES`: `period` (0 = fixed), `rowShift`, `buried`.
- `GOBLINS`: `sight`, `flank`, `packWake`, `den` (spawn period), `starve` (double move every N turns).
- `IMPS`: `wake` (`near` | `light`), `wakeDist`, `steps`, `dive` (dive length, 0 = none), `diveRange`, `packWake`.
- `MECHANISMS`: `plate` (`open` | `close` | `dart` | `timed`), `range`, `turns`.
- `SKELETONS`: `sight`, `rebuild`, `avoid` (walks around spikes), `range` (archer, 0 = melee), `shared` (one rebuild timer per pack).
- `PITS`: `crumble` (`none` | `leave` | `stand`), `hidden`. `PIT_DROP` = 3 (landing search radius).
- `DARK`: `radius`, `burn`, `brazier`.
- `TRAPS`: Trapsetter `spikes`, `dart` (range 5), `stairs` (false stairs).
- `ITEMS`: `potion` (heal 1), `oil` (turns 20), `bomb` (radius 1).
- `PACK_RADIUS` = 4: enemies of one kind within 4 tiles of each other at the start form a pack.

## Map characters

| Char | Meaning |
|---|---|
| `#` `T` `.` `@` `>` `k` `D` `/` | as in Phase 3 |
| `^` | spikes. T1 fixed; T2 breathing; T3 wave; T4 starts buried |
| `u` | buried spikes (internal; `^` on a T4 floor). Revealed to `^` (fixed) when you stand orthogonally next to it |
| `x` | Trapsetter spikes: fixed, cause `trap` |
| `O` | open pit |
| `,` | crumbling floor (T2) or chain over a pit (T3) |
| `;` | a chain cracking: it falls next turn (internal) |
| `o` | hidden pit (T4) |
| `_` | pressure plate; its effect comes from the mechanisms tier |
| `H` / `h` | gate, closed / open |
| `S` / `s` | plate dart slit (a wall), idle / armed |
| `Z` / `z` | Trapsetter dart slit (a wall, tripwire), idle / armed |
| `F` | false stairs (Trapsetter) |
| `G` | goblin den |
| `Y` / `y` | brazier, unlit / lit |
| `p` `l` `b` | potion, lamp oil, bomb |
| `g` `i` `K` | goblin, imp, skeleton (floor underneath) |

- Dark rooms are rectangles in `Floor.dark` because they lie on top of other tiles.
- A plate is linked to the nearest gate or slit (Manhattan distance; ties go to row-major order).
- A slit fires toward its first open orthogonal neighbour, checked in the order U, D, L, R.

## State additions

- `item`, `rng` (mulberry32 state), `clocks` (timed gates: `{x, y, left}`), `nextId`, `darkTurns`.
- Each enemy gains `aim: Pos[]` (wind-up targets), `timer` (pile countdown) and `pack`. Modes are `idle | alert | chase | windup | pile`.
- `Floor` gains optional `seed`, `tiers` and `dark`.

## Turn order (fixed)

1. **Player acts.**
   - Move, attack (bumping a pile resets its countdown), open a door with the key, light a brazier, or use an item.
   - Moving onto a tile picks up a key or item (an item swaps with the one held), destroys a den, and falls into a pit (open or hidden) or onto false stairs.
2. **Mechanisms tick.**
   1. Armed slits fire.
   2. Clocks count down; a gate closes when its clock runs out and the gate tile is empty.
   3. This turn's plate press takes effect.
   4. Tripwires arm.
   5. Buried spikes are revealed.
   6. Cracking chains fall; new chains crack; crumbling floor you just left falls.
   7. Dens spawn.
3. **Enemies act** in id order.
4. **Torch burns** 1, or `DARK.burn` inside an active dark room. At 0 it counts dark turns: 1 heart every 2 turns (the rule recorded in §8).
5. **Damage resolves.** Each hit carries `at`, the tile where it lands.
6. **End check.**

## Rules per cell

**Spikes**
- T1 always up.
- T2 is up when `turn mod 3 = 0`, half-raised the turn before, down otherwise.
- T3 is the same, offset by one phase per row.
- T4 starts buried: a static hairline-crack tell when lit; revealed when you stand next to it, then fixed.
- Spikes hurt when you enter a raised tile, or when a tile rises under you.

**Goblins**
- T1: alert (a glint, no move) when within 4 tiles with line of sight; then it chases. Next to you it winds up, aiming at your tile, and lunges at that tile the turn after.
- T2: a pair that wakes together. The second goblin heads for the tile on the far side of you from the first.
- T3: a den spawns a goblin when `turn mod 6 = 0` (tell the turn before). Stepping on the den destroys it.
- T4: a starving goblin moves twice when `turn mod 3 = 0` (tell the turn before).

**Imps**
- T1: wakes within 4 tiles (Manhattan, through walls) and flies 2 per turn over ground hazards. When two steps are equally good, the seeded rng picks one.
- T2: diver. When it shares a row or column with you within 5 tiles in clear line, it winds up and marks the whole line (up to 6 tiles). Next turn it dives along the line and overshoots; you are hurt if you are on the line.
- T3: a swarm of 3 that wakes together.
- T4: wakes when its tile is lit by your torch (instead of by distance).

**Mechanisms**
- T1: the plate opens its gate.
- T2: the plate slams its gate shut.
- T3: the plate arms its slit (the line shows); next turn a dart flies up to 5 tiles and hits the first creature in its path.
- T4: the plate opens its gate, which closes 5 turns later (tell on the last turn).

**Skeletons**
- T1: chases like a goblin but walks over spikes. A hit or raised spikes collapse it into a pile, which rebuilds after 4 turns. The pile shows a countdown; 1 is the tell.
- T2: rebuilds in 3; paths around spikes (BFS).
- T3: archer. It lines up with your row; within 3 tiles in clear line it winds up, then shoots the first creature in the line.
- T4: a pair sharing one rebuild timer. A pile that collapses joins its packmate's countdown.

**Pits**
- T1: entering a pit costs 1 heart. You land on the safe tile within 3 tiles whose BFS distance to the stairs is smallest.
- T2: crumbling floor falls away after you step off it.
- T3: a chain cracks the turn you step on it and falls the next turn; if you are still on it, you fall.
- T4: a hidden pit shows a static missing-mortar tell when lit; entering it reveals it and you fall.

**Dark rooms**
- T1: torch radius 1 inside.
- T2: also burns 2 per turn.
- T3: the T2 rules, and the room holds another family (the scene puts fixed spikes in the dark).
- T4: a dark wing with a brazier. Bumping the brazier lights it and ends the darkness for that room.

**Trapsetter**
- Spikes: fixed, cause `trap`.
- Dart slit: arms when you are in its line (range 5), fires the next turn, then can arm again the turn after.
- False stairs: entering costs 1 heart, and the tile crumbles to floor. The tell is a missing step pixel when lit.

**Items** (one slot; E or the item button; using one costs a turn; picking one up swaps it with the one held)
- Potion: +1 heart, up to 3.
- Lamp oil: +20 torch, capped at the floor's torch.
- Bomb: defeats every enemy within 1 tile (8 neighbours), removes skeletons and piles for good, and clears spikes within 1 tile.

## Tells (`tells(state)` in sim.ts)

- Every tell is `{ kind, x, y, cause }`.
- Kinds:
  - `spikes-up`, `spikes-half`, `crack`, `pit`, `crumble`, `cracking`, `mortar`, `missing-step`
  - `slit`, `armed`, `gate`, `windup`, `alert`, `rebuild`, `spawn`, `hungry`, `dark`
- The hidden ones (`crack`, `mortar`, `missing-step`) appear only on lit tiles.
- The test asserts: **every hurt at turn n has a tell with the same cause at the same tile in the state after turn n − 1.**

## Scenes (`src/shared/scenes.ts`, new file)

- There are 34 scenes: `<family>-<tier>`, `trap-spikes`, `trap-dart`, `trap-stairs`, `item-potion`, `item-oil`, `item-bomb`. Each is `{ id, family, tier, caption (≤ 8 words), floor, log, expect }`.
- `expect` has two parts:
  - `hurt: [turn, cause][]`, the exact list of damage
  - `at: { turn, tile? | enemy? | pos? | hearts? | torch? | item? | tell? }[]`, the state changes
- One definition serves three uses:
  - the Vitest case (replay, assert outcome, timing and tell-before-damage)
  - the Lab Bestiary loop
  - `game.html?scene=<id>` (dev builds only)
- `game.ts` imports scenes only inside `if (import.meta.env.DEV)` as a dynamic import, so production never contains them. A check greps `dist/`.

## Client

- `sprites.ts`:
  - new pack frames: spikes f0–f2, hole, buttons, crate
  - `look(state)` (props, tells and enemy anims per tile)
  - `choreograph(events, next)`: motions within the 120 ms lock, including the imp's 3-step arc, the dive, the dart or arrow streak, the fall, and the wind-up pose (1 px back, the anticipation frame)
- `art.ts` draws only what the pack lacks:
  - the dart slit
  - the false-stairs missing step
  - the hairline crack and the missing mortar line
  - the gate bars, the chain bridge, the crumbling cracks
  - the den, the brazier (unlit and lit)
  - the tell marks (aim corners, line dash, glint) and the countdown digits 1–4
- `scene.ts` re-syncs props from tiles each turn (pits open, gates slam, spikes breathe) and plays `choreograph()`.
- `ui.ts`: the HUD item slot shows the held item.
- `lab.ts` Bestiary tab:
  - a family × tier grid plus a strip for the traps and items
  - each cell loops its scene, with pause, step and 0.25× controls, its caption and its cost
  - the drawing comes from `look()` and `choreograph()`

## Assumptions

- A1. Tiers are per floor and per family (`Floor.tiers`, default 1). Each tier's flags are written out in full in `content.ts`, not inherited from the tier below.
- A2. Enemy attacks aim at a tile. The wind-up marks the tiles, and the attack hits whoever stands there next turn, so stepping away dodges it. This applies to the Floor 0 goblin too (Phase 3's goblin hit without a wind-up), and Phase 3's goblin test was updated.
- A3. T1 imps wake by Manhattan distance through walls (they hear you); T4 imps need your light on their tile.
- A4. Plate darts and Trapsetter darts arm one turn, then fire the next, so every dart has a one-turn tell. Darts and arrows hit the first creature in their path, enemies included.
- A5. Buried spikes are revealed by standing orthogonally next to them, then stay up for good (fixed).
- A6. A T1 skeleton walks onto spikes and collapses; T2 and later avoid them. Bumping a pile resets its countdown. Piles block movement.
- A7. A pit landing is the safe tile within 3 tiles that is nearest the stairs by BFS (ties go to row-major order); with no stairs, the nearest safe tile.
- A8. False stairs cost 1 heart and crumble to floor. All Trapsetter damage has cause `trap`.
- A9. A potion at full hearts is still used up. Lamp oil is capped at the floor's torch.
- A10. A gate doesn't close while something stands in it; it closes on the first free turn.
- A11. Dark rooms: vision depends only on whether you stand inside an active dark rectangle. T3 has the T2 rules, and its scene adds fixed spikes.
- A12. A den spawns an idle goblin, which wakes by sight (so it shows its alert glint first).
- A13. Random floor decoration no longer uses `floor-crack`, so cracks always mean danger.
- A14. Scenes live in `src/shared/scenes.ts` (a new file, listed as a file request in the report).
- A15. Blood aim corners mean "this tile hurts or shuts next turn" everywhere. They mark wind-up targets, a timed gate's last turn, a cracking chain, and half-raised spikes, so a tell is never hidden under the hero sprite.
- A16. Every plate uses the pack's blue button. The red one would read as a blood tell; the slit and its armed line carry the dart warning.
- A17. A pile that falls before its own turn gets +1 on its timer, so the countdown shows `rebuild` (4, 3, 2, 1 at T1). Bumping a pile resets only that pile.
- A18. A flanker winds up only from its flank tile (or when it can't move), so the pincer is visible.
- A19. The tile geometry (tile lookup, line of sight, BFS, rays) moved from sim.ts to `src/shared/grid.ts`, because sim.ts passed 600 lines. PLAN.md §4 puts the BFS in gen.ts; gen.ts will import it from grid.ts instead.
- A20. Trapsetter traps and items cost 0: they sit outside the floor budget.
