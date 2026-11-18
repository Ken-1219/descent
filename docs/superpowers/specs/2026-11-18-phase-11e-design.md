# Phase 11e: readable on a phone (design and results)

Source: the owner's Phase 11e brief (Nov 18), built on the first blind playtest (Phase 11d). Starting point: 0d64144. Display, wording and layout only. No simulation, stored-format or wire-type change: the golden runs and the timed 18-move run guard that. No new dependency, no new colour, no font file.

## Decisions (continuing A1–A79)
- **A80. Phone framing:**
  - **Zoom:** `fit()` keeps its whole-number zoom (2 to 4), and on a floor shorter than the stage steps up one whole zoom at a time until the floor fills the height. A step is taken only while at least 8 columns still show (`FILL_COLS`: the torch's reach of 4 each side, less half a tile at the edges). It refits on every new floor and on resize. At 390 wide that is zoom 3 on floors up to about 15 rows, zoom 2 above.
  - **Camera: locked to the hero, plus a dead zone.** It never lags: it moves in the same frame as the hero, as before (follow with lerp 1). New: a dead zone, so the map holds still until the hero comes within 5 tiles of the view's edge. Exits stay where you saw them. The dead zone is off while a panel lifts the map, so the death tile is centred at once.
  - **What a touch device shows:** the d-pad (3×56 px) and the Item button sit in a bar under the map. That is the area the keyboard tester saw as empty black: at 393×659 with touch, the map fills the space between the HUD and the bar (checked in the mobile Playwright browser). With a keyboard on a desktop browser the bar shows only the key hints line.
- **A81. Digits:** 0–9 come from the device's own bold sans through a `local()` `@font-face` with `unicode-range: U+0030-0039`, placed first in both font stacks. Letters stay in the two pixel fonts. No download: font budget unchanged at two files. Covers the HUD, cards, the board, the clock and the intro. Canvas digits (the skeleton and Warden counters) are hand-drawn 3×5 pixel glyphs already.
- **A82. No heart lost unseen:**
  - **The wind-up tell:** every tile an attack is aimed at is filled with blood at 35%, above the actors and below the fog, for every enemy (imps included), on top of the existing corner marks and the lean.
  - **Your bump:** an enemy you hit flashes bone for 90 ms.
  - **The dark:** an enemy that strikes from the dark is drawn above the fog for 700 ms; darts and arrows streak above the fog.
  - **The line under the HUD** names the cause on the turn of every hit, and now beats the low-torch line.
  - **E2E (section 24):** for every damage source the scenes cover, plus the Warden arena and a Floor 0 on a 3-turn torch, the cause is on screen on the turn it lands: dark, dart, goblin, imp, pit, skeleton, spikes, trap, warden. Arrows and closing gates are named by the same map but no scene hurts the hero with them.
- **A83. Warden days:**
  - **The countdown:** filled marked tiles (A82), and a countdown over the Warden at twice the pixel size: the turns until its next slam once 4 or fewer, "1" during the wind-up.
  - **The intro, in plain words:** "Walk into it: each bump breaks one link (30 a run at most). Everyone today shares this chain; when it breaks, the Warden falls for all. Take the stairs whenever you like: your links count either way."
  - **First turns:** until your first link breaks, the line under the HUD reads "Bump the Warden for links. Stairs any time."
  - **The HUD:** the shared links left, and once you have broken one, "-N" in ember for this run's. The shared total moves during the run: the visible-only 20 s poll the result card already used, now also while playing.
- **A84. Choices:** the curse, the trap kind and the carving are rows of the game's own buttons in a fieldset: `aria-pressed`, roving tab index, and arrow keys, Home and End pick. Touch taps.
  - **Curses and traps:** one row each, with its one-line effect. Trap effects are new text in `content.ts` (`TRAP_EFFECT`).
  - **The carving:** one sideways-scrolling row of phrases, as short as the old select, so the death tile stays in view. A path phrase ("Stairs this way…") swaps the row for its four arrows, led by the phrase (tap it to choose again).
- **A85. The result card:** the main action, then "Practice this floor" and one link: "Carvings (N)" when there are carvings to judge, else "Board". Everything else (Board or Carvings, Chronicle, Depth as flair, Something broke?, Comments) sits behind one native `<details>` "More".
- **A86. Torch:** the intro states the day's budget: "Torch: 90 turns of light today (practice gave 120)." The bracket shows only after Floor 0. From turn 8, Floor 0's line reads "Practice torch is generous: real floors give less."
- **A87. Timing tests:** relative or best-of, never single-shot wall-clock:
  - `generate(28)`: the median of 50 is asserted, the mean is reported.
  - The 10,000-player board: best of 3.
  - The depth-28 replay: best of 5 replays (the stored call is timed and reported once).
  - E2E: the tap scenes wait for each turn instead of a fixed 140 ms.
- **A88. Local harness:** `?day=N&seed=S` makes today Floor N from seed S, so a blind tester can play a Warden day through its real intro. Normal floors use the dev `?depth=N&seed=S` path, which plays the same floor without the day's limits.
- **A89. Second blind playtest fixes (wording, hints, fit; no rule change):**
  - **What your own action did:** the line under the HUD says "The goblin falls." on a kill, "The skeleton crumbles. It will rise again." on a collapse, and what a potion, lamp oil or bomb did when used. A hit's line stays one turn longer, so a quick next tap no longer wipes it.
  - **Hints wrap** instead of ending in "…". The dark-room line is shorter: "Dark room: the torch burns faster. Light a brazier to end it."
  - **The HUD fits:** under 420 px the slots and gaps shrink; under 360 px the hearts are drawn at 24 px and the wick's cord is hidden (the flame and the count stay). Measured: no overlap at 320 or 390 with a two-digit floor.
  - **An intro with no yesterday** says "The first floor. Nobody has fallen yet." only on Floor 1; later floors say "Nobody fell here yesterday."

## Results
- `bun run check`: 157/157, golden runs 11/11, lint clean. E2E: 127/127, with layouts from 320×320 to 1280×800, the timed 18-move run, and section 24 (the cause on screen for 9 damage sources).
- Reddit (playtest v0.0.1.452, 390×844 touch): Floor 10's result card (primary, Board, More, Practice); Floor 10 practice at zoom 3, with "10" and the torch both readable; Floor 7 (a Warden floor) practised from the Chronicle at zoom 4. The Warden fell on that subreddit, so its arena is quiet, as the server serves it.

## Second blind playtest (a new agent; touch taps and swipes at 390×844; first look, first session, 14 runs)
| Floor (rollover seed) | Bot win | Blind result |
|---|---|---|
| d6 s1010 | 63% | cleared, 33 turns, no damage |
| d6 s2006 | 69% | cleared, 29 (2 hearts) |
| d6 s3007 | 72% | fell to the dark, turn 53 |
| d13 s1013 | 66% | cleared, 33 (1 heart) |
| d13 s2016 | 63% | cleared, 30 |
| d13 s3018 | 50% | fell to an imp, turn 45 |
| d20 s1025 | 19% | fell to the dark, turn 66 |
| d20 s2024 | 59% | fell to the dark, turn 56 |
| d20 s3025 | 84% | cleared, 47 |
| d27 s1028 | 50% | cleared, 80 |
| d27 s2031 | 22% | fell to the dark, turn 77 |
| d27 s3038 | 19% | cleared, 69 |
| d7 Warden s1010 | 75% | cleared, 22, broke 7 links (84→77) |
| d28 Warden s1033 | 41% | fell to a skeleton, turn 59 (never found the Warden) |

7 of 14 cleared; the bot predicts about 54% over these floors. 5 of the 7 deaths were the dark after getting lost.

**The first tester's confusion, now:**
| First tester (11d) | Now |
|---|---|
| A heart lost with no message or flash | Mostly gone: hits are named and enemies flash. Twice still missed, most likely because the line cleared on the next tap; it now stays a turn longer (A89). |
| A thin band of map in a tall black screen; a sliding camera | Gone (zoom fills; dead zone). New: at the map's top edge the hero sits under the hint line. |
| The pixel font's 3/5/8 | Gone (not mentioned; digits read correctly in all 14 runs). |
| Imps hit while passing; bumps that did nothing | Partly gone: "the orange frame… great, readable and fair once learned". Still there: "couldn't tell if my hit landed" (kill line added, A89). |
| Warden marks unclear | Gone: "red strike tiles with countdown… great". |
| The compass grid and the red frame | Still there briefly, worked out after the trap step. |
| Retry before anything failed; the Sound button toggling by itself; arrow keys on a dropdown | Gone. |
| The practice line cut off | Still there for the longer line; hints now wrap (A89). |
| Six buttons on the card | Gone (Board, More, Practice, primary). |

**New in this playtest:** truncated dark-room hint (fixed); torch count under Sound on two-digit floors (fixed); no kill, bomb or potion feedback (fixed); "The first floor" on Floor 7's intro (fixed). Also: remembered enemies look live in the dark; a gate drawn over the hero; Honour, liar votes and streaks unexplained; the item from Floor 0 not carried over; the potion "only 1 heart"; swipes not seen (Playwright's drag sends mouse events, not touch, so this is not evidence about real swipes). Harness only: the countdown restarts and "Streak 1" after a fall come from the local fake server; on Reddit both are the server's values. "The same layout on three seeds": checked, they differ (`generate` with those seeds gives three maps); they share the room-grid look.

## Proposals (larger than wording; not built)
1. **A seen map:** keep explored tiles dimly drawn (memory, not sight), so a lost player can retrace. Client only; the fog's rules stay.
2. **Remembered enemies drawn as memories:** out of the light, the last-seen sprite at half alpha in stone, so it doesn't read as a live enemy.
3. **Room above the map's edge:** let the camera bounds include the hint line's height, so at the top edge the hero is never under it.
4. **Hero over a gate:** draw the hero above a tall prop on the row below it.
5. **One line of help on the Board** for Honour, liar votes and streaks.
