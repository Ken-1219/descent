# Phase 2: Cast (design)

Source: PLAN.md §11 Phase 2, §6, §7, §15.4. The user's rules for this phase:
- Reuse the pack's own idle, run and hit frames, re-timed to §15.4. Do not redraw them.
- Draw new art only for the wisp, the wall torch, and the death-to-wisp frames.
- Credit 0x72 in the README.

## Cast map

| Cast member | Source | Animations |
|---|---|---|
| Delver | our cleric (Phase 1) | idle (2 frames: the base frame plus a flame-flicker key swap), hurt (blood flash then base), death-to-wisp (new frames) |
| Wisp | **new** pixel map, 2 frames | float: tail flicker plus a 1 px bob, irregular holds |
| Own ghost | wisp with the `ink-0` outline keyed to `ember` | same as wisp |
| Goblin | pack `goblin` idle and run f0–f3 | idle, run |
| Imp | pack `imp` idle and run f0–f3 | perch (idle f0 held), idle, run |
| Skeleton | pack `skelet` idle and run f0–f3; bone pile is pack `skull` | idle, run (holds before each step), pile |
| Warden | pack `big_zombie` idle and run f0–f3 (32×36) | idle (heavy holds), run |
| Potion, lamp oil | pack `flask_big_red`; `flask_yellow` (small, so its silhouette differs from the potion) | 2-step bob |
| Bomb | pack `bomb_f0`–`f2` | lit fuse |
| Key | our gilt key icon (Phase 1) | 2-step bob |
| Stairs, door | pack `floor_stairs`; `doors_leaf_closed` / `_open` (32×32, centred on the door tile and overhanging the walls on both sides) | static |
| Wall torch | **new** sconce plus 3 flame frames | flame frames in shuffled order, holds of 84–140 ms |
| Floors, walls | pack `floor_1`–`floor_8`; `wall_mid`, `wall_top_mid`, `wall_hole_1`, `wall_hole_2` | static |

Enemy hurt has no pack frame, so it is a blood flash frame (tint), the same as the Delver's.

## Units

- `sprites.ts` gains:
  - an `Anim` type: `{ frames: Frame[]; ms: number[]; loop: boolean }`, where `Frame = { src: 'own' | 'pack'; name; dy?: number; tint?: Token }`
  - an `ANIMS` table
  - `frameAt(anim, elapsedMs)`, a pure function returning the frame index
  - `drawAnimFrame()`
  - pack entries for every frame above
  - new pixel maps: wisp ×2, torch ×3, death ×6
- `lab.ts` gains a Cast tab with these sections:
  - Silhouettes: `ink-0` fills on a `pale` plate, at 2×
  - Death to wisp: looping at 2× and 4×
  - Line-up at 1×, 2× and 4×
  - Light: each sprite on a floor tile at darkness 0, 0.5 and 0.86
  - Animations: all looping, each with its own phase offset
  - Filmstrips: every frame side by side, with its ms
- The Tokens tab drops "Hero options", since the hero is decided.
- `tests/shared.test.ts` gains:
  - every `ANIMS` frame names an existing sprite or pack entry
  - `ms.length === frames.length`
  - every frame is at least 84 ms (12 fps or slower)
  - every animation has a hold (max ms > min ms)
  - `frameAt` wraps loops and clamps one-shots

## Timing (§15.4)

| Animation | Frame ms |
|---|---|
| Delver idle | 520, 380 |
| Goblin idle | 110, 90, 110, 160 (a single hold; it never holds on steps) |
| Goblin run | 84 each except the last at 120 |
| Imp perch | idle f0, 600 |
| Imp idle | 120, 90, 90, 200 |
| Imp run | 84, 84, 84, 140 |
| Skeleton idle | 180, 140, 140, 260 |
| Skeleton run | 220 (the hold before the step), 100, 100, 120 |
| Warden idle | 260, 160, 160, 340 |
| Warden run | 240, 120, 120, 200 |
| Wisp float | 500 at dy 0, 380 at dy −1, 620 at dy 0, 300 at dy −1 |
| Bomb fuse | 140, 100, 180 |
| Items bob | 700 at dy 0, 500 at dy −1 |
| Torch flame | 3 frames, shuffled at runtime with random holds of 84–140 ms (cosmetic randomness in the client) |
| Hurt | blood flash 84, base 140 |

Death to wisp is a one-shot. The collapse takes about 600 ms: d1 100, d2 100, d3 140, then a 200 ms beat of complete stillness (d3 held), then the flame gutters (d4 120). The flame goes out on d5 (140). The wisp forms on d6 (160) and rises slowly: wisp at dy −2 for 240, dy −4 for 300, dy −6 for 420. Total ≈ 1.8 s.

## Assumptions

- C1. Death runs longer than PLAN's "about 600 ms". At 12 fps or slower, 9+ frames cannot fit in 600 ms. The collapse-to-flame-out part is ≈ 600 ms; the slow wisp rise follows it.
- C2. Delver idle frame 2 is derived by a key swap (flame and eyes flicker from ember to gilt), not redrawn. Hurt uses a tint frame.
- C3. The key keeps our Phase 1 gilt icon (the pack has none). If it fails the silhouette gate, it goes on the Later list.
- C4. Ghost stacking (2–4 wisps, a 5+ cluster) belongs to Phase 7, with the ghost feature.
- C5. The hop, the lunge and the Warden's slam are tweens in `scene.ts` (Phase 3+). The Juice tab is Phase 11.
- C6. Tells (blood marks) are Phase 4 ("sprites for each tell").
