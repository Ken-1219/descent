# Phase 11g: one heart a turn, readable danger and exits, floor names (design and results)

Source: the owner's Phase 11g brief (Nov 19), built on the third blind playtest (Phase 11f). Starting point: 17fd944. This phase changes the rules on purpose (part A first), so both sets of goldens were re-recorded deliberately.

## Decisions (continuing A1–A100)
- **A101. Rules:**
  - At most one heart is lost per turn (`HURT_PER_TURN = 1` in `content.ts`). The first hit in the sim's existing order takes it and is the cause shown; any other source that landed that turn is absorbed: one `hurt` event, never two.
  - A potion used at full hearts isn't spent. `step` returns the same state with one `kept` event (no turn, never logged, like a bump), and the line says "Your hearts are full: the potion stays in your pack."
  - Practice items still stay on Floor 0 (the 11f wording is kept). The README states both rules.
- **A102. The exact frame:** a wind-up frame on your own tile is drawn only if waiting there costs a heart next turn. The sim is deterministic, so `shownTells` (sprites.ts) runs `step(s, 'W')` once per redraw. Frames on other tiles still mark where an attack lands. The scene fill, the corner marks and the frame lesson all use it.
  - "Costs a heart" means the lookahead has a `hurt` event. On the merciful Floor 0 at one heart the frame still shows (the hit lands, mercy keeps the heart), so practice teaches the same frame.
- **A103. Warden marks in words:** standing on a Warden-marked tile beats every other hint line: "The Warden strikes this tile next turn: step off it." A mark is always one turn ahead (the strike follows the wind-up), so N is always 1.
- **A104. Warnings above the light:** the audit (below) found every heart's source on a lit tile with a tell the turn before. The ones a player can miss sit on the rim of a dark room's radius-1 light, where the glow is darkest. Two display fixes:
  - Every warning (wind-up fills, aim corners, dart lines, cracks, mortar, glints) draws above the glow and under the fog: light never dims a warning.
  - The torch's glow reaches one tile past its radius instead of half a tile, so a dark room's rim tiles, walls and floor included, are no longer near-black.
- **A105. Exits, display:**
  - Remembered walls sit under lighter fog (40%) than remembered floor (60%), so a room's shape reads after you leave it.
  - A real opening (a one-tile gap in a wall line, a room on one side and a way on at the other; `opening()` in map.ts) gets a pale threshold strip on its room side in the scene, and a pale cell on the Map ("pale: a way out").
  - The light's tips are not openings and get no strip. At radius 4 the light's top, bottom, left and right are single lit tiles with black beside them, and they read as corridor stubs: this, not the generator, is what the third tester took for notches.
- **A106. Exits, generator:**
  - A one-tile notch off a room's edge (a corridor end leading nowhere) becomes wall. Real dead-end corridors stay.
  - Wall torches stand only inside a run of wall: never on a room's corner tile (the corner beside it is often unseen, so a lit torch beside dark read as an alcove), never beside an opening, and always with wall behind.
  - Measured: real one-tile notches were almost never made (dead-end tiles outside rooms: 7 on 112 posted floors, all longer corridors). The torch rule is what moved the goldens.
- **A107. Floor names:** "The <first> <second>" by seed, from two fixed lists of 16 words in `content.ts` (`FLOOR_FIRST`, `FLOOR_SECOND`, append only). Shown on the intro and result cards (a gilt kicker over the headline), on the splash title, and under each Chronicle floor (the server reads each floor's stored seed). Floor 0 has no name.
- **A108. Stone tint:** walls and floor are multiplied by one token per seven-floor cycle (`STONE_TINT`: none, bone, wisp, ember for depths 1–7, 8–14, 15–21, 22–28; wrapping after). No new colours. A test keeps the hero (bone) at 3:1 or more on every tinted stone; every earlier contrast check still passes.
- **A109. The boot line:** "Still dark?" was already `visibility: hidden` (out of the accessibility tree) until 8 s. The tester found it by text search during play, so it now leaves the page when the boot screen hides.
- **Not now (as briefed):** decoration sets and floor shapes.

## Goldens (re-recorded on purpose)
- **Simulation:** the 10 recorded runs are identical: none of them ever took two hearts in one turn. One run was added: F6B, a generated depth-6 floor where the skill-60 bot took two hearts on turn 46 before 11g and takes one now.
- **Generator:** every recorded depth (1, 5, 7, 14, 21, 28) moved, because of the wall-torch rule.
- **A110. Fourth blind playtest fixes (wording only):**
  - In a dark room, "Torch low" counts turns, not torch: "4 turns of light left (this room burns 2 a turn)". The burn comes from a one-turn lookahead (`step(s, 'W')`), so the line can't drift from the rules.
  - A kill reads "The goblin is slain.": "falls" read as knocked down.
  - Beside the Warden, its hint says "right beside you" instead of "here".

## Measurements (448 posted floors: 16 rollovers of 28 days, 32 bot runs each)
- **Fairness after 11g:**
  - Most hearts lost in one turn: 1 (447 floors at 1, 1 at 0). Before: 2 on 136 floors, 3 on 3.
  - Every 11f cap still holds: plates always reachable, at most 2 dark rooms in a row, at most 4 / 4 / 3 goblins / imps / skeletons and 2 dens in one room.
  - Route and Warden walk, as a share of the torch: max 43% and 31%, as before.
- **Win-rate spread (bands and depth targets unchanged):**
  | | before | after |
  |---|---|---|
  | raw win %, mean (sd) | 62.1 (38.7) | 62.1 (38.8) |
  | posted win %, mean (sd) | 55.8 (20.9) | 55.6 (20.9) |
  | distance from the target line, mean (sd) | −2.0 (14.9) | −2.2 (14.7) |
  | rerolls per floor, mean | 4.1 | 4.2 |
  | by cycle (1–7 / 8–14 / 15–21 / 22–28) | 77.5 / 60.1 / 47.1 / 38.5 | 77.3 / 60.9 / 45.8 / 38.3 |

  The one-heart rule barely moves the bot: it dies to the dark, not to double hits. The spread narrowed slightly.

## Visibility audit (bot runs, 4 per floor, on all 448 floors)
For every heart lost: was its source lit, or did it show a tell, on the turn before?
| source | hearts lost | unseen | on a dark room's rim |
|---|---|---|---|
| dark | 1488 | 0% | – |
| spikes | 652 | 0% | 78 (12%) |
| pit | 372 | 0% | 71 (19%) |
| warden | 377 | 0% | 14 |
| arrow | 168 | 0% | 23 |
| goblin | 118 | 0% | 0 |
| imp | 113 | 0% | 0 |
| skeleton | 105 | 0% | 0 |
| dart | 12 | 0% | 10 |

No heart came from an unseen source. The ones a player can miss are on the rim of a dark room's radius-1 light, where the glow was darkest: A104 draws every warning above the glow, and pushes the glow out by half a tile.

## Fourth blind playtest (a new agent; touch at 390×844; fresh rollover seeds)
| # | Floor | Bot win | Blind result | Unexplained hearts |
|---|---|---|---|---|
| 1 | d6 s7012 | 88% | cleared, 39 turns | 0 |
| 2 | d6 s8009 | 79% | cleared, 35 | 0 |
| 3 | d6 s9008 | 79% | fell to the dark, turn 45 | 0 |
| 4 | d13 s7014 | 88% | fell to the dark, turn 56 | 0 |
| 5 | d13 s8013 | 83% | cleared, 47 | 0 |
| 6 | d13 s9013 | 38% | cleared, 46 | 0 |
| 7 | d20 s7030 | 71% | cleared, 30 | 0 |
| 8 | d20 s8024 | 83% | fell to the dark, turn 43 | 0 |
| 9 | d20 s9028 | 4% | cleared, 63 | 0 |
| 10 | d27 s7030 | 46% | fell to the dark, turn 63 | 1 |
| 11 | d27 s8038 | 21% | fell to the dark, turn 51 | 0 |
| 12 | d27 s9034 | 42% | cleared, 54 | 0 |
| 13 | d14 Warden s7018 | 54% | cleared, 78 (12 links) | 0 |
| 14 | d21 Warden s8031 | 29% | fell to the Warden, turn 27 | 0 |

8 of 14 cleared (7 in each earlier playtest); the bot predicts about 60% over these floors. One heart in 14 runs went unexplained. It was lost on the turn the tester swapped lamp oil for a potion. The hurt line outranks the swap line, so the cause was shown, but only for one turn, and the next move replaced it. The tester called 5 runs fair, 3 of them only partly; the dark took 5 of the 6 who fell.

The practice floor reset mid-run once. That was the local dev server reloading after a code edit during the test, not the game.

**The third tester's confusions:**
- Wall-torch alcoves and notches that look like doorways: **gone** (not mentioned; torches stand in wall runs now).
- Wall and floor nearly one colour in a dark room: **still there** ("invisible walls"). Separately, tiles inside the light's edge that looked like floor were walls.
- The frame lesson pinned on imps: **gone** (the frames were "readable and fair").
- The Map's gold edge: **gone** (it found the exit in run 2). **New:** "pale: way out" read as pointing at a wall. The screenshot shows a real opening between two rooms.
- The Warden's direction flipping: **partly there** ("west" while diagonal is the dead band; "here" when beside it now says "right beside you").
- A potion spent at full hearts, and items left in practice: **gone** (not met, or not minded).
- Most deaths to the dark after dead ends: **still there** (5 of 6).
- **New:**
  - The dark room's double burn went unnoticed: the lesson was missed, and "Torch low" counted torch. Fixed in A110.
  - Braziers were found by accident on run 11. The dark lesson names them, but the tester missed it.
  - Holes look like stairs from far off, and retracted spikes look like cobbles.
  - "falls" read as knocked down. Fixed in A110.
  - The end card's turns don't match the torch used (dark rooms burn more).
  - A single message line.

## Proposals (not built)
- **A short log:** the last 2–3 lines under the HUD instead of one. It would have explained the one unexplained heart. Client only, about 2 hours.
- **A dark room seen from outside:** draw a dark sill on a dark room's openings, so you know before you step in. Client only, about 1 hour.
- **Art:** a hole that can't pass for stairs, and retracted spikes that read as a trap, not cobbles. About 2 hours each.
- **The end card:** show "torch burned" beside the turns. About 30 minutes.

## Results
- `bun run check`: 162/162, with both goldens re-recorded on purpose. Lint is clean.
- E2E: 139/139, including the timed 18-move run, layouts from 320×320 to 1280×800, the frame sweep both ways, the Warden-mark line, the potion kept, the intro kicker and the Map key.
- **Reddit (playtest v0.0.1.519, 390×844):**
  - Floor 11's splash and intro say "The Crooked Deeps".
  - Its stone wears the bone tint (cycle 2), with a pale threshold on the room's east opening.
  - No move was made, so the owner's run is unspent.
