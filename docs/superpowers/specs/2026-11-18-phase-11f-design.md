# Phase 11f: finding your way, teaching once, fair floors (design and results)

Source: the owner's Phase 11f brief (Nov 18), built on the second blind playtest (Phase 11e). Starting point: 3e70976. Parts A and B are display and hints. Part C opens the generator's tuning on purpose. The simulation's rules don't change: the golden runs are byte-identical. The generator's golden digests were re-recorded on purpose.

## Decisions (continuing A1–A89)
- **A90. Seen map:** remembered tiles sit under 55% fog, down from 70%. The trail was there before, but too dark for the tester to notice. The fog's rules (`seen`, `visibility`) are untouched.
- **A91. The Map button:**
  - A button above Item, and M on a keyboard, opens an overview in the card overlay. It shows every seen tile (walls stone, floor ink), you in bone, and the stairs in ember once seen. False stairs look like stairs on the map, as they do to the eye.
  - It is not an action: no `data-act`, no turn, nothing logged, and game keys are ignored while it is open. Escape, M or Close shuts it.
  - Cells are 3–12 px, whatever fits the stage. New file: `src/client/map.ts`.
- **A92. Remembered foes:** a foe that leaves sight leaves a memory where it was last seen: one still frame, filled stone grey, at 50% alpha, under the fog. It goes when that tile is in sight again without the foe, or when the foe is in sight anywhere, or killed. The Warden is never remembered: it is chained.
- **A93. Camera:** its bounds take 2 tiles of room past every edge of the map. At any edge the hero stays at least 3 tiles from the view's edge: clear of the hint line over the top, the practice bar at the foot, and the controls, which are outside the stage. The dead zone (A80) is unchanged.
- **A94. Gates:** a door or gate sorts with the row above it, so a hero standing just north of a gate is drawn over the gate's top.
- **A95. Intro compass:**
  - The heading is "Danger on this floor, by area".
  - Each cell carries its compass letters (NW … SE), as on the trap step; the trap step now uses the same list (`ZONE_SHORT`).
  - On a Warden day with the Warden alive, the arena's cell is framed in gilt and says "Warden".
  - The first-turn hint says which way it lies: "The Warden is to the south-west: bump it for links. Stairs any time."
- **A96. Teach each thing once:**
  - `TEACH` in `content.ts`: imp, spikes, skeleton, dark, gate, bomb, lamp, warden, each with one line.
  - A lesson shows the first time its thing is in sight, or in hand for items, then never again for that player.
  - It outranks every line but a hit, and stays a turn longer. It replaces the per-room dark-room notice from 11d.
  - What is taught is kept on the device and on the server as one bitmask per player: a Redis hash `hints`, the same pattern as `tutorial`, and removed by "Delete my data" and the account sweep.
  - Wire: `POST /api/hint {bit}` → `{hints}`, plus an optional `hints` on the floor response. The bit order is a stored format: append only. New file: `src/client/teach.ts`.
- **A97. Board help:** three lines under the tabs:
  - "Honour: Trust votes on your carvings, given by players after their own run."
  - "Liar votes: the same players calling a carving false."
  - "Streak: floors in a row you played, cleared or fell."
- **A98. Fairness caps (generator):**
  - `ROOM_FOE_CAP`: at most 4 goblins (a den counts as 2), 4 imps and 3 skeletons in one room. Rooms at the cap leave the candidate list, so the budget is spent elsewhere.
  - Every barred gate shut at the start has its plate reachable while every gate is shut (`platesReachable`). Generated floors have no keys: bars are opened by plates, and the teach line says so ("no key opens it").
  - At most `DARK_RUN_MAX` = 2 dark rooms in a row along the safe route (`darkRun`).
  - A floor that fails the last two is rejected, like the other gates.
  - Retries at depth 28: max 3 before, 7 now (p99 5, no fallback, mean 5 ms). The bound test is raised from 4 to 8 on purpose.
- **A99. Goldens:** `tests/golden.json` re-recorded on purpose. The 10 simulation runs are identical; the generator digests moved at depths 14 and 28, and stayed the same at 1, 5, 7 and 21.
- **A100. Third blind playtest fixes (wording, hints, map colours; no rule change):**
  - **Map colours:** floor stone, walls ink-2, unexplored black. A seen floor tile beside an unseen one is an edge you haven't followed yet, drawn gilt and named in the key ("gold: not explored past here"). A dead-end notch has no gold edge, so it reads differently from a way on.
  - **The frame lesson** now names any foe ("a foe strikes there next turn"): goblins wind up too, and the tester stopped trusting a frame the lesson had pinned on imps. Its bit is unchanged.
  - **A new lesson, `dart`** (appended as bit 8), for a lit dart line: "Red dots in a line: a dart flies along it. A blue plate on the floor, or a step near the slit, fires it."
  - **The intro compass** marks the zone you start in ("you start").
  - **The Warden's direction** is measured from its 2×2 block with a dead band, so it no longer flips west, south-west, south-east as you close in.
  - **A potion used at full hearts** now says "The potion was wasted: your hearts were already full."
  - **Floor 0's later line** is now "Practice is generous: real floors give less torch, and its items stay here."
  - **The Board's Honour line** says what a carving is.
  - **Local harness only:** the card's countdown runs to the real next 15:00 UTC (it restarted on every redraw), and "New today" comes from the floor's own showcase, not a fixture.

## Measured (floors as the rollover posts them: `fairSeed(d, s·1000 + d)`, depths 1–28 × 16 seeds = 448 floors, no crowd)
| Measure | Before | After |
|---|---|---|
| Most goblins in one room (den = 2) | 16 | 4 |
| Most imps in one room | 20 | 4 |
| Most skeletons in one room | 10 | 3 |
| Floors with a barred gate whose plate is out of reach | 1 | 0 |
| Most dark rooms in a row on the route | 3 (on 17 floors) | 2 |
| Most hearts the skill-60 bot loses in one turn (32 runs per floor) | 3 on 9 floors, 2 on 154 | 3 on 3 floors, 2 on 136 |
| Shortest route as % of the torch | max 43%, median 40% | unchanged |
| Warden days: turns to the arena as % of the torch | max 31% | unchanged |
| Mean plain-floor bot win rate | 55.4% | 55.8% |

Both difficulty bands (`curve.test.ts`) and the 28-day rollover test pass unchanged. Route length and the Warden walk were never near the torch, so getting lost (not the budget) is what the dark punished: the seen map and the Map button answer that.

## Proposals (not built)
1. **At most one heart lost per turn (a rule change).** After the caps, the bot still takes 2 hearts in one turn on 136 of 448 floors (30%) and 3 on 3. Every source that lands on the same turn would still hit, but the hearts lost would be capped at one, the rest absorbed. Cost: a sim change and new simulation goldens; the bands would need re-measuring (they would get easier).
2. **Variety at a glance** (the tester took three floors for one map). Cheapest first:
   - **A floor name in the intro and the HUD's floor chip** ("The Drowned Halls"), picked from a word list by seed. Words only; about an hour; no generator change.
   - **A stone grade per floor:** the wall and floor grading picks one of the existing tokens by seed (no new colour). Client only; about 2 hours; screenshots of different floors stop looking alike.
   - **Decoration sets:** banners, bones, columns and rugs from the tileset, placed by seed on wall faces and room corners. Client only, deterministic; about half a day.
   - **Floor shapes:** wide or tall maps, L-shaped rooms and winding corridors. A generator change: about 1–2 days, with new generator goldens and both bands re-measured.

## Results
- `bun run check`: 159/159. The simulation goldens are unchanged; the generator goldens were re-recorded on purpose (depths 14 and 28). Lint is clean.
- E2E (see the report): the full suite, plus section 25 (teach once, the map by button and by M, the map plate from 320×320 to 1280×800, the compass heading, letters and arena, the Board help). The timed 18-move run is included.
- **Reddit (playtest v0.0.1.477, 390×844, touch):** Floor 11's intro shows the compass heading, letters and "you start"; its floor response carries `hints`. Floor 11 practice opens only after your own run there, and that run belongs to the owner's trap test, so the in-game Map and seen-map check on Reddit is left for the owner's own run. Both were checked locally on the same build, and in the third playtest.

## Third blind playtest (a new agent; touch at 390×844; fresh rollover seeds, plus 3007, 3018 and 2031 again)
| # | Floor | Bot win | Blind result |
|---|---|---|---|
| 1 | d6 s4016 | 94% | cleared, 12 turns |
| 2 | d6 s5008 | 56% | cleared, 36 |
| 3 | d6 s3007 (again) | 22% | fell to the dark, turn 40 |
| 4 | d13 s4019 | 94% | cleared, 28 |
| 5 | d13 s5018 | 56% | fell to the dark, turn 59 |
| 6 | d13 s3018 (again) | 100% | cleared, 23 |
| 7 | d20 s4029 | 38% | cleared, 25 |
| 8 | d20 s5029 | 38% | fell to the dark, turn 60 |
| 9 | d20 s6031 | 72% | fell to the dark, turn 65 |
| 10 | d27 s4038 | 38% | cleared, 50 |
| 11 | d27 s5035 | 3% | fell to spikes, turn 61 |
| 12 | d27 s2031 (again) | 59% | cleared, 35 (1 heart) |
| 13 | d7 Warden s4010 | 56% | fell to the Warden, turn 45 (5 links) |
| 14 | d28 Warden s4029 | 38% | fell to an imp, turn 47 |

7 of 14 cleared, as in the second playtest; the bot predicts about 55% over these floors. Since the tuning changed the generator, seeds 3007, 3018 and 2031 now make different maps. The tester called 5 runs fair (3 of them only partly). Every death in the second playtest had been marked unfair.

## Proposals added by the third playtest (not built)
- **Readable exits in the dark.** Most deaths were still the dark after dead ends: wall-torch alcoves and one-tile notches look like doorways, and in a dark room wall and floor are nearly one colour. Options: draw remembered walls a step lighter than remembered floor in the scene, as the map now does; or keep wall-torch alcoves out of the room edge in the generator. The first is client only (about 2 hours); the second is a generator change with new goldens.
- **Items from practice.** The potion picked up on Floor 0 vanishes on Floor 1. The line now says so; carrying it over would be a rule change.
- **A potion at full hearts.** It is still spent (the line now says so). Not spending it would be a rule change.
